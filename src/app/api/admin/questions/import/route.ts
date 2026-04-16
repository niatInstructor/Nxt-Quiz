import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — bulk import questions
export async function POST(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { questions } = await request.json();
  if (!Array.isArray(questions)) {
    return NextResponse.json({ error: "Questions array is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  interface ImportQuestion {
    id?: string;
    topic?: string;
    difficulty?: string;
    question: string;
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
    question: q.question,
    options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options),
    correct_option_id: q.correct_option_id || q.correctOptionId,
    explanation: q.explanation || "",
    tags: q.tags || [],
  }));

  const { data, error } = await supabase
    .from("questions")
    .upsert(formatted, { onConflict: "id" })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: data?.length || 0 });
}
