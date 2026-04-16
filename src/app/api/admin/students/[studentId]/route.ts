import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // 1. Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", studentId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // 2. Fetch all exam attempts
  const { data: attempts } = await supabase
    .from("attempts")
    .select(`
      *,
      exams (
        title,
        exam_code
      )
    `)
    .eq("user_id", studentId)
    .order("created_at", { ascending: false });

  // 3. For each attempt, fetch answers if it's submitted
  const enrichedAttempts = await Promise.all((attempts || []).map(async (attempt) => {
    if (attempt.status === 'submitted') {
      const { data: answers } = await supabase
        .from("attempt_answers")
        .select(`
          *,
          questions (*)
        `)
        .eq("attempt_id", attempt.id);
      
      return { ...attempt, answers: answers || [] };
    }
    return attempt;
  }));

  return NextResponse.json({
    student: profile,
    attempts: enrichedAttempts
  });
}
