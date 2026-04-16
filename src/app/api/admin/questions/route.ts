import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — list all questions from the bank
export async function GET(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: questions, error } = await supabase
    .from("questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ questions: questions || [] });
}

// POST — create a new question
export async function POST(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { topic, difficulty, question, options, correct_option_id, explanation, tags, code_snippet, question_type } = body;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("questions")
    .insert({
      topic,
      difficulty,
      question,
      options: typeof options === 'string' ? options : JSON.stringify(options),
      correct_option_id,
      explanation,
      tags,
      // Note: If you have columns for code_snippet and question_type in your DB
      // they should be included here. Based on previous code, they might be in the JSON.
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
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { deleteAll } = await request.json();
  if (!deleteAll) {
    return NextResponse.json({ error: "deleteAll confirm required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Wipe all related data first
  await supabase.from("exam_questions").delete().neq("question_id", " sentinel"); // delete all
  await supabase.from("attempt_answers").delete().neq("question_id", "sentinel"); // delete all

  const { error } = await supabase.from("questions").delete().neq("id", "sentinel");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
