import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — reset a student's attempt (clear all answers, reset status)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .single();

  if (attempt) {
    // Delete all answers
    await supabase
      .from("attempt_answers")
      .delete()
      .eq("attempt_id", attempt.id);

    // Reset attempt
    await supabase
      .from("attempts")
      .update({
        status: "active",
        submitted_at: null,
        total_score: 0,
      })
      .eq("id", attempt.id);
  }

  // Reset participant status
  await supabase
    .from("exam_participants")
    .update({ status: "active", submitted_at: null })
    .eq("exam_id", examId)
    .eq("user_id", userId);

  return NextResponse.json({ success: true });
}
