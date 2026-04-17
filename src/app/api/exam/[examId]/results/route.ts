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

  if (!user) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  // Use admin client securely to bypass RLS for detailed questions table
  const admin = createAdminClient();

  // 1. Get the attempt and verify it's valid and submitted
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, status")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
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

  // 3. Fetch the full questions mapping
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

  const formattedResults = examQuestions.map((eq: any) => {
    const q = eq.questions;
    return {
      id: q.id,
      position: eq.position,
      points: eq.points,
      topic: q.topic,
      questionType: q.question_type,
      question: q.question,
      codeSnippet: q.code_snippet,
      options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
      correctOptionId: q.correct_option_id,
      explanation: q.explanation,
      selectedOptionId: answersMap.get(q.id) || null,
    };
  });

  return NextResponse.json({ results: formattedResults });
}
