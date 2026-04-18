import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Get exam
  const { data: exam } = await supabase
    .from("exams")
    .select("id, status")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  if (exam.status !== "in_progress") {
    return NextResponse.json(
      { error: "Exam must be in progress to end it" },
      { status: 400 }
    );
  }

  // Auto-submit all active attempts with server-side scoring
  const { data: activeAttempts } = await supabase
    .from("attempts")
    .select("id, exam_id, user_id")
    .eq("exam_id", examId)
    .eq("status", "active");

  if (activeAttempts && activeAttempts.length > 0) {
    // Get questions and correct answers for scoring
    const { data: examQuestions } = await supabase
      .from("exam_questions")
      .select("question_id, points")
      .eq("exam_id", examId);

    // SEC-07: Scope to this exam's questions instead of fetching entire question bank
    const questionIds = (examQuestions || []).map(eq => eq.question_id);
    const { data: questions } = await supabase
      .from("questions")
      .select("id, correct_option_id")
      .in("id", questionIds.length > 0 ? questionIds : ["__none__"]);

    const correctMap = new Map(
      (questions || []).map((q) => [q.id, q.correct_option_id])
    );
    const pointsMap = new Map(
      (examQuestions || []).map((eq) => [eq.question_id, eq.points])
    );
    const maxScore =
      (examQuestions || []).reduce((sum, q) => sum + q.points, 0) || 0;

    for (const attempt of activeAttempts) {
      const { data: answers } = await supabase
        .from("attempt_answers")
        .select("question_id, selected_option_id")
        .eq("attempt_id", attempt.id);

      let totalScore = 0;
      (answers || []).forEach((a) => {
        if (a.selected_option_id === correctMap.get(a.question_id)) {
          totalScore += pointsMap.get(a.question_id) || 1;
        }
      });

      await supabase
        .from("attempts")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          total_score: totalScore,
          max_score: maxScore,
        })
        .eq("id", attempt.id);
    }

    // Update all active participants to submitted
    await supabase
      .from("exam_participants")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("exam_id", examId)
      .eq("status", "active");
  }

  // Close the exam
  await supabase
    .from("exams")
    .update({
      status: "closed",
      closes_at: new Date().toISOString(),
    })
    .eq("id", examId);

  return NextResponse.json({ success: true });
}
