import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — get a single question
export async function GET(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> }
) {
  const { questionId } = await params;
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: question, error } = await supabase
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ question });
}

// PATCH — update a question
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> }
) {
  const { questionId } = await params;
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { topic, difficulty, question_type, question, code_snippet, options, correct_option_id, explanation, tags } = body;

  const supabase = createAdminClient();

  const updates: {
    topic?: string;
    difficulty?: string;
    question_type?: string;
    question?: string;
    code_snippet?: string;
    options?: string;
    correct_option_id?: string;
    explanation?: string;
    tags?: string[];
  } = {};
  if (topic) updates.topic = topic;
  if (difficulty) updates.difficulty = difficulty;
  if (question_type) updates.question_type = question_type;
  if (question) updates.question = question;
  if (code_snippet !== undefined) updates.code_snippet = code_snippet;
  if (options) updates.options = typeof options === 'string' ? options : JSON.stringify(options);
  if (correct_option_id) updates.correct_option_id = correct_option_id;
  if (explanation) updates.explanation = explanation;
  if (tags) updates.tags = tags;

  const { data, error } = await supabase
    .from("questions")
    .update(updates)
    .eq("id", questionId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, question: data });
}

// DELETE — remove a question from the bank
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> }
) {
  const { questionId } = await params;
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Note: This might fail if the question is used in an exam (foreign key constraint)
  // We should handle that or delete from exam_questions first.
  await supabase.from("exam_questions").delete().eq("question_id", questionId);
  await supabase.from("attempt_answers").delete().eq("question_id", questionId);

  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
