import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userId = user?.id;
  if (!userId && (process.env.ENVIRONMENT === "local")) {
    userId = "00000000-0000-0000-0000-000000000001";
  }

  if (!userId) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  // Use admin client securely to bypass RLS for detailed questions table
  const admin = createAdminClient();

  // 1. Get the attempt and verify it's valid and submitted
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, status")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .single();

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (attempt.status !== "submitted") {
    return NextResponse.json(
      { error: "Exam is not submitted yet" },
      { status: 403 }
    );
  }

  // 2. Fetch the student's selected answers
  const { data: answers } = await admin
    .from("attempt_answers")
    .select("question_id, selected_option_id")
    .eq("attempt_id", attempt.id);

  // 3. Fetch exam status to determine if we should reveal the answer key
  const { data: exam } = await admin
    .from("exams")
    .select("status")
    .eq("id", examId)
    .single();

  const isExamClosed = exam?.status === "closed";

  // 4. Fetch the full questions mapping
  const { data: examQuestions } = await admin
    .from("exam_questions")
    .select(`
      position,
      points,
      questions (
        id,
        topic,
        question_type,
        question,
        code_snippet,
        options,
        correct_option_id,
        explanation
      )
    `)
    .eq("exam_id", examId)
    .order("position");

  if (!examQuestions) {
    return NextResponse.json({ results: [] });
  }

  const answersMap = new Map(
    answers?.map((a) => [a.question_id, a.selected_option_id]) || []
  );

  interface ExamQuestionWithDetails {
    position: number;
    points: number;
    questions: {
      id: string;
      topic: string;
      question_type: string;
      question: string;
      code_snippet: string | null;
      options: string | { id: string; text: string }[];
      correct_option_id: string;
      explanation: string;
    };
  }

  const formattedResults = (examQuestions as unknown as ExamQuestionWithDetails[]).map((eq) => {
    const q = eq.questions;
    // Critical Fix: Omit correct answer key and explanation unless exam is officially closed
    return {
      id: q.id,
      position: eq.position,
      points: eq.points,
      topic: q.topic,
      questionType: q.question_type,
      question: q.question,
      codeSnippet: q.code_snippet,
      options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
      correctOptionId: isExamClosed ? q.correct_option_id : null,
      explanation: isExamClosed ? q.explanation : "Answers will be visible once the instructor closes the exam.",
      selectedOptionId: answersMap.get(q.id) || null,
    };
  });

  return NextResponse.json({ results: formattedResults, isPublished: isExamClosed });
}
