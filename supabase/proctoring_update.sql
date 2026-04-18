-- Add tab_switch_count to attempts table
ALTER TABLE public.attempts 
ADD COLUMN IF NOT EXISTS tab_switch_count integer NOT NULL DEFAULT 0;

-- Atomic increment function
CREATE OR REPLACE FUNCTION public.increment_tab_switch(p_attempt_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.attempts
  SET tab_switch_count = tab_switch_count + 1
  WHERE id = p_attempt_id
  RETURNING tab_switch_count INTO v_count;
  
  RETURN v_count;
END;
$$;

-- need to execute this queries

-- Atomic Join function with Capacity Lock
CREATE OR REPLACE FUNCTION public.join_exam(p_exam_code text, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_id uuid;
  v_status exam_status;
  v_capacity integer;
  v_count integer;
  v_starts_at timestamptz;
  v_closes_at timestamptz;
  v_participant_id uuid;
  v_is_kicked boolean;
BEGIN
  -- 1. Lock the exam row for duration of transaction to prevent race conditions on capacity
  SELECT id, status, capacity, starts_at, closes_at
  INTO v_exam_id, v_status, v_capacity, v_starts_at, v_closes_at
  FROM public.exams
  WHERE exam_code = UPPER(p_exam_code)
  FOR UPDATE;

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'Invalid exam code';
  END IF;

  -- 2. Check if user is already a participant or was kicked
  SELECT id, (status = 'kicked') INTO v_participant_id, v_is_kicked
  FROM public.exam_participants
  WHERE exam_id = v_exam_id AND user_id = p_user_id;

  IF v_is_kicked THEN
    RAISE EXCEPTION 'You have been removed from this exam';
  END IF;

  IF v_participant_id IS NOT NULL THEN
    RETURN v_exam_id;
  END IF;

  -- 3. Check Join Window
  -- Allow if waiting OR if in_progress and within 10 mins of starts_at
  IF NOT (
    v_status = 'waiting' OR 
    (v_status = 'in_progress' AND v_starts_at IS NOT NULL AND (now() - v_starts_at) <= interval '10 minutes')
  ) THEN
    RAISE EXCEPTION 'Exam join window is closed';
  END IF;

  -- 4. Check Capacity
  SELECT count(*) INTO v_count
  FROM public.exam_participants
  WHERE exam_id = v_exam_id AND status <> 'kicked';

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'Exam is at full capacity';
  END IF;

  -- 5. Insert Participant
  INSERT INTO public.exam_participants (exam_id, user_id, status, started_at)
  VALUES (
    v_exam_id, 
    p_user_id, 
    CASE WHEN v_status = 'in_progress' THEN 'active'::participant_status ELSE 'waiting'::participant_status END,
    CASE WHEN v_status = 'in_progress' THEN now() ELSE NULL END
  );

  -- 6. Create Attempt immediately if in_progress
  IF v_status = 'in_progress' THEN
    INSERT INTO public.attempts (exam_id, user_id, server_started_at, server_due_at, max_score)
    SELECT v_exam_id, p_user_id, now(), v_closes_at, coalesce(sum(points), 0)
    FROM public.exam_questions
    WHERE exam_id = v_exam_id;
  END IF;

  RETURN v_exam_id;
END;
$$;

-- Enable Realtime for live updates
-- This allows students to see time extensions and exam status changes immediately
ALTER TABLE public.exams REPLICA IDENTITY FULL;
ALTER TABLE public.attempts REPLICA IDENTITY FULL;

BEGIN;
  -- Drop existing if any to avoid errors
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.exams, public.attempts, public.exam_participants;
COMMIT;
