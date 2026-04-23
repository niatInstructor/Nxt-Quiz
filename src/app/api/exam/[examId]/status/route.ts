import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// SEC-03: Require authentication before exposing exam metadata
export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // BUG-01: Fix operator precedence
  let userId = user?.id;
  const isLocal = process.env.ENVIRONMENT === "local" || process.env.NEXT_PUBLIC_ENVIRONMENT === "local";
  
  if (!userId && isLocal) {
    userId = "00000000-0000-0000-0000-000000000001";
  }

  if (!userId) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  const admin = createAdminClient();

  // SEC-03: Verify user is a participant of this exam (or an admin)
  const { data: participant } = await admin
    .from("exam_participants")
    .select("id")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .single();

  if (!participant) {
    // Allow admins through as well
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Not a participant of this exam" }, { status: 403 });
    }
  }

  const { data: exam } = await admin
    .from("exams")
    .select("title, status, capacity, duration_seconds")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  // Get user's attempt if it exists
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, server_due_at, status")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .single();

  const { count } = await admin
    .from("exam_participants")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId)
    .in("status", ["waiting", "active", "submitted", "kicked"]);

  return NextResponse.json({
    title: exam.title,
    status: exam.status,
    capacity: exam.capacity,
    durationSeconds: exam.duration_seconds,
    participantCount: count || 0,
    attempt: attempt || null,
  });
}
