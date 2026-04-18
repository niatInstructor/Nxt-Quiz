import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

// GET — list all questions from the bank (STD-09: with optional pagination)
export async function GET(_request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const url = new URL(_request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") || "100")));

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: questions, error, count } = await supabase
    .from("questions")
    .select(
      `
      *,
      exam_questions (
        exams (
          id,
          title,
          exam_code
        )
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ questions: questions || [], total: count || 0, page, pageSize });
}

// POST — create a new question
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    topic,
    difficulty,
    question_type,
    question,
    code_snippet,
    options,
    correct_option_id,
    explanation,
    tags,
  } = body;

  // Request Validation
  if (
    !topic ||
    typeof topic !== "string" ||
    !question ||
    typeof question !== "string" ||
    !correct_option_id ||
    !Array.isArray(options) ||
    options.length < 2
  ) {
    return NextResponse.json(
      { error: "Invalid question payload. Topic, question, options (min 2), and correct answer are required." },
      { status: 400 }
    );
  }

  // STD-11: Basic input sanitization (defense-in-depth)
  const sanitize = (s: string) =>
    s.replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("questions")
    .insert({
      topic: sanitize(topic.trim()),
      difficulty: difficulty || "Basic",
      question_type: question_type || "theory",
      question: sanitize(question.trim()),
      code_snippet: code_snippet ? sanitize(code_snippet) : null,
      options: typeof options === "string" ? options : JSON.stringify(options),
      correct_option_id,
      explanation: explanation ? sanitize(explanation) : "",
      tags: tags || [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, question: data });
}

// DELETE — bulk delete all questions
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // 1. Critical: Disable in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Bulk deletion is disabled in production." },
      { status: 403 }
    );
  }

  // 2. Critical: Require strict confirmation
  const { confirmation } = await request.json().catch(() => ({}));
  if (confirmation !== "WIPE QUESTIONS") {
    return NextResponse.json(
      { error: "Confirmation 'WIPE QUESTIONS' required." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Wipe all related data first
  await supabase.from("exam_questions").delete().neq("question_id", "sentinel");
  await supabase.from("attempt_answers").delete().neq("question_id", "sentinel");

  const { error } = await supabase
    .from("questions")
    .delete()
    .neq("id", "sentinel");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
