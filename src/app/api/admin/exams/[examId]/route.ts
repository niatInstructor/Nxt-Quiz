import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;

  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const { data: participants } = await supabase
    .from("exam_participants")
    .select(
      `
      id,
      user_id,
      status,
      joined_at,
      started_at,
      submitted_at,
      profiles (
        full_name,
        email,
        student_college_id
      )
    `,
    )
    .eq("exam_id", examId)
    .order("joined_at", { ascending: true });

  // Fetch attempts for these participants to get tab_switch_count
  const { data: attempts } = await supabase
    .from("attempts")
    .select("user_id, tab_switch_count")
    .eq("exam_id", examId);

  const attemptMap = new Map((attempts || []).map(a => [a.user_id, a.tab_switch_count]));

  const enrichedParticipants = (participants || []).map(p => ({
    ...p,
    tab_switch_count: attemptMap.get(p.user_id) || 0
  }));

  return NextResponse.json({
    exam,
    participants: enrichedParticipants,
  });
}

// PATCH — update exam details
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { title, durationMinutes, capacity } = await request.json();

  if (
    (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) ||
    (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) ||
    (capacity !== undefined && (!Number.isInteger(capacity) || capacity <= 0))
  ) {
    return NextResponse.json({ error: "Invalid PATCH payload" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get current exam state to handle live time extensions
  const { data: currentExam } = await supabase
    .from("exams")
    .select("status, starts_at")
    .eq("id", examId)
    .single();

  const updates: { title?: string; duration_seconds?: number; capacity?: number; closes_at?: string } = {};
  if (title) updates.title = title;
  
  if (durationMinutes) {
    const newDurationSeconds = durationMinutes * 60;
    updates.duration_seconds = newDurationSeconds;

    // SCENARIO: Exam is live -> Extend the deadline
    if (currentExam?.status === "in_progress" && currentExam.starts_at) {
      const startsAt = new Date(currentExam.starts_at).getTime();
      const newClosesAt = new Date(startsAt + newDurationSeconds * 1000).toISOString();
      updates.closes_at = newClosesAt;

      // Sync new deadline to all active attempts immediately
      await supabase
        .from("attempts")
        .update({ server_due_at: newClosesAt })
        .eq("exam_id", examId)
        .eq("status", "active");
    }
  }

  if (capacity !== undefined) updates.capacity = capacity;

  const { data, error } = await supabase
    .from("exams")
    .update(updates)
    .eq("id", examId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, exam: data });
}

// DELETE — remove an exam and all its related data
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // 1. Delete attempts (which cascades to attempt_answers if configured, but let's be safe)
  const { data: attempts } = await supabase
    .from("attempts")
    .select("id")
    .eq("exam_id", examId);

  if (attempts && attempts.length > 0) {
    const attemptIds = attempts.map((a) => a.id);
    await supabase.from("attempt_answers").delete().in("attempt_id", attemptIds);
    await supabase.from("attempts").delete().eq("exam_id", examId);
  }

  // 2. Delete participants
  await supabase.from("exam_participants").delete().eq("exam_id", examId);

  // 3. Delete exam questions
  await supabase.from("exam_questions").delete().eq("exam_id", examId);

  // 4. Delete the exam itself
  const { error } = await supabase.from("exams").delete().eq("id", examId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
