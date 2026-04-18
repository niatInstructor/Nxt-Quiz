import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const admin = await getAdminUser();
  if (!admin) {
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

  // 3. Batched fetch for all answers across all submitted attempts (Avoid N+1)
  const submittedAttemptIds = (attempts || [])
    .filter((a) => a.status === "submitted")
    .map((a) => a.id);

  interface StudentAnswer {
    attempt_id: string;
    id: string;
    question_id: string;
    selected_option_id: string | null;
    is_bookmarked: boolean;
    is_skipped: boolean;
    questions: Record<string, unknown>;
  }

  let allAnswers: StudentAnswer[] = [];
  if (submittedAttemptIds.length > 0) {
    const { data: answers } = await supabase
      .from("attempt_answers")
      .select(`
        *,
        questions (*)
      `)
      .in("attempt_id", submittedAttemptIds);
    allAnswers = (answers || []) as StudentAnswer[];
  }

  // 4. Map answers back to their respective attempts
  const enrichedAttempts = (attempts || []).map((attempt) => {
    if (attempt.status === "submitted") {
      return {
        ...attempt,
        answers: allAnswers.filter((ans) => ans.attempt_id === attempt.id),
      };
    }
    return attempt;
  });

  return NextResponse.json({
    student: profile,
    attempts: enrichedAttempts,
  });
}
