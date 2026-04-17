-- 1. Add new columns to the questions table
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'theory',
ADD COLUMN IF NOT EXISTS code_snippet text;

-- 2. Drop the existing view first to avoid column mismatch errors
DROP VIEW IF EXISTS public.student_exam_questions;

-- 3. Re-create the student_exam_questions view with the new columns
CREATE VIEW public.student_exam_questions AS
SELECT
  eq.exam_id,
  eq.position,
  eq.points,
  q.id,
  q.topic,
  q.difficulty,
  q.question_type,
  q.question,
  q.code_snippet,
  q.options,
  q.tags
FROM public.exam_questions eq
JOIN public.questions q ON q.id = eq.question_id
WHERE public.is_admin() OR public.is_exam_participant(eq.exam_id);
