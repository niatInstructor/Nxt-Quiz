import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const body = await request.json();
  const { attemptId, questionId, selected_option_id, is_bookmarked, is_skipped } =
    body;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  // Upsert answer
  const { error } = await supabase.from("attempt_answers").upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      selected_option_id: selected_option_id || null,
      is_bookmarked: is_bookmarked || false,
      is_skipped: is_skipped || false,
      answered_at: selected_option_id ? new Date().toISOString() : null,
      cleared_at: !selected_option_id ? new Date().toISOString() : null,
    },
    { onConflict: "attempt_id,question_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
