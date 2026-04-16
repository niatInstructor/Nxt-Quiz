import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — kick a participant from the exam
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

  // Update participant status to kicked
  const { error } = await supabase
    .from("exam_participants")
    .update({ status: "kicked" })
    .eq("exam_id", examId)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also auto-submit their attempt if active
  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, status")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .single();

  if (attempt && attempt.status === "active") {
    await supabase
      .from("attempts")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
  }

  return NextResponse.json({ success: true });
}
