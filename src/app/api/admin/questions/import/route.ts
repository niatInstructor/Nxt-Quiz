import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — bulk import questions
export async function POST(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { questions, examId } = await request.json();
  if (!Array.isArray(questions)) {
    return NextResponse.json({ error: "Questions array is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  interface ImportQuestion {
    id?: string;
    topic?: string;
    difficulty?: string;
    questionType?: string;
    question: string;
    codeSnippet?: string;
    options: unknown;
    correct_option_id?: string;
    correctOptionId?: string;
    explanation?: string;
    tags?: string[];
    points?: number;
  }

  const formatted = questions.map((q: ImportQuestion) => ({
    id: q.id || `q-${Math.random().toString(36).substr(2, 9)}`,
    topic: q.topic || "Unknown",
    difficulty: q.difficulty || "Basic",
    question_type: q.questionType || "theory",
    question: q.question,
    code_snippet: q.codeSnippet || null,
    options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options),
    correct_option_id: q.correct_option_id || q.correctOptionId,
    explanation: q.explanation || "",
    tags: q.tags || [],
  }));

  const { data: insertedQuestions, error } = await supabase
    .from("questions")
    .upsert(formatted, { onConflict: "id" })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Link questions to the exam if examId is provided
  if (examId && insertedQuestions) {
    // Clear existing links for this exam to allow "overwrite" behavior
    await supabase.from("exam_questions").delete().eq("exam_id", examId);

    const examQuestions = insertedQuestions.map((q, i) => ({
      exam_id: examId,
      question_id: q.id,
      position: i + 1,
      points: 1,
    }));

    const { error: linkError } = await supabase
      .from("exam_questions")
      .insert(examQuestions);

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, count: insertedQuestions?.length || 0 });
}
