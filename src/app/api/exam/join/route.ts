import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { examCode } = await request.json();

  if (!examCode) {
    return NextResponse.json({ error: "Exam code is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Check profile onboarding
  const { data: profile } = await supabase
    .from("profiles")
    .select("student_college_id, onboarded_at")
    .eq("id", user.id)
    .single();

  if (!profile?.student_college_id) {
    return NextResponse.json(
      { error: "Please complete onboarding first" },
      { status: 400 }
    );
  }

  // Use admin client to find exam (bypasses RLS — student isn't a participant yet)
  const admin = createAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("id, status, capacity, starts_at, closes_at")
    .eq("exam_code", examCode.toUpperCase())
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Invalid exam code" }, { status: 404 });
  }

  // Allow joining if status is 'waiting' OR ('in_progress' and within 10 minutes of starts_at)
  const isWithinJoinWindow = 
    exam.status === "waiting" || 
    (exam.status === "in_progress" && 
     exam.starts_at && 
     (new Date().getTime() - new Date(exam.starts_at).getTime()) <= 10 * 60 * 1000);

  if (!isWithinJoinWindow) {
    const errorMsg = exam.status === "in_progress" 
      ? "The join window for this exam has closed (10-minute limit exceeded)."
      : "This exam is not accepting new participants.";
    return NextResponse.json(
      { error: errorMsg },
      { status: 400 }
    );
  }

  // Check if already joined (use admin client to bypass RLS)
  const { data: existing } = await admin
    .from("exam_participants")
    .select("id, status")
    .eq("exam_id", exam.id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    if (existing.status === "kicked") {
      return NextResponse.json(
        { error: "You have been removed from this exam" },
        { status: 403 }
      );
    }
    return NextResponse.json({ examId: exam.id });
  }

  // Check capacity
  const { count } = await admin
    .from("exam_participants")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", exam.id)
    .neq("status", "kicked");

  if (count && count >= exam.capacity) {
    return NextResponse.json({ error: "Exam is at full capacity" }, { status: 400 });
  }

  // Join — use admin client to insert (student doesn't have INSERT policy)
  const participantStatus = exam.status === "in_progress" ? "active" : "waiting";
  const { error: joinError } = await admin.from("exam_participants").insert({
    exam_id: exam.id,
    user_id: user.id,
    status: participantStatus,
    started_at: exam.status === "in_progress" ? new Date().toISOString() : null,
  });

  if (joinError) {
    return NextResponse.json({ error: joinError.message }, { status: 500 });
  }

  // If joining an in-progress exam, create an attempt immediately
  if (exam.status === "in_progress") {
    // Get total points for max_score
    const { data: qStats } = await admin
      .from("exam_questions")
      .select("points")
      .eq("exam_id", exam.id);
    
    const maxScore = qStats?.reduce((sum, q) => sum + (q.points || 0), 0) || 0;

    await admin.from("attempts").insert({
      exam_id: exam.id,
      user_id: user.id,
      server_started_at: new Date().toISOString(),
      server_due_at: exam.closes_at,
      status: "active",
      max_score: maxScore,
    });
  }

  return NextResponse.json({ examId: exam.id });
}
