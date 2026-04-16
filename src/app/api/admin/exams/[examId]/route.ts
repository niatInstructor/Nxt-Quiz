import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;

  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
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

  return NextResponse.json({
    exam,
    participants: participants || [],
  });
}

// PATCH — update exam details
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { title, durationMinutes, capacity } = await request.json();
  const supabase = createAdminClient();

  const updates: any = {};
  if (title) updates.title = title;
  if (durationMinutes) updates.duration_seconds = durationMinutes * 60;
  if (capacity) updates.capacity = capacity;

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
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
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
