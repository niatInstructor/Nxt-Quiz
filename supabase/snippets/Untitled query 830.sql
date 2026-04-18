-- Enable Realtime for live updates
-- This allows students to see time extensions and exam status changes immediately
ALTER TABLE public.exams REPLICA IDENTITY FULL;
ALTER TABLE public.attempts REPLICA IDENTITY FULL;

BEGIN;
  -- Drop existing if any to avoid errors
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.exams, public.attempts, public.exam_participants;
COMMIT;
