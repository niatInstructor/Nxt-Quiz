import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;

  // Verify admin
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // We need to call start_exam as admin — since we use service role,
  // we need to set a custom claim or call it directly.
  // The start_exam function checks is_admin(), which requires auth.uid().
  // With service role, we bypass RLS but auth.uid() is null.
  // So we'll do the logic inline with service role.

  // Get exam
  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  if (exam.status !== "waiting") {
    return NextResponse.json(
      { error: "Exam must be in waiting status" },
      { status: 400 },
    );
  }

  const now = new Date();
  const closesAt = new Date(now.getTime() + exam.duration_seconds * 1000);

  // Update exam status
  const { error: updateError } = await supabase
    .from("exams")
    .update({
      status: "in_progress",
      starts_at: now.toISOString(),
      closes_at: closesAt.toISOString(),
    })
    .eq("id", examId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get waiting participants
  const { data: participants } = await supabase
    .from("exam_participants")
    .select("user_id")
    .eq("exam_id", examId)
    .eq("status", "waiting");

  if (participants && participants.length > 0) {
    // Get exam questions for max_score calculation
    const { data: examQuestions } = await supabase
      .from("exam_questions")
      .select("points")
      .eq("exam_id", examId);

    const maxScore = examQuestions?.reduce((sum, q) => sum + q.points, 0) || 50;

    // Create attempts
    const attempts = participants.map((p) => ({
      exam_id: examId,
      user_id: p.user_id,
      server_started_at: now.toISOString(),
      server_due_at: closesAt.toISOString(),
      max_score: maxScore,
      status: "active" as const,
    }));

    await supabase.from("attempts").upsert(attempts, {
      onConflict: "exam_id,user_id",
    });

    // Update participant statuses
    await supabase
      .from("exam_participants")
      .update({ status: "active", started_at: now.toISOString() })
      .eq("exam_id", examId)
      .eq("status", "waiting");
  }

  return NextResponse.json({ success: true, startsAt: now.toISOString() });
}
