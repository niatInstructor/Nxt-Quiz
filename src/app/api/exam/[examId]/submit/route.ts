import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;
  const { attemptId } = await request.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  // Use admin client for scoring
  const admin = createAdminClient();

  // Get attempt
  const { data: attempt } = await admin
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("user_id", user.id)
    .single();

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (attempt.status === "submitted") {
    return NextResponse.json({ message: "Already submitted" });
  }

  // Calculate score
  const { data: questionAnswers } = await admin
    .from("attempt_answers")
    .select("question_id, selected_option_id")
    .eq("attempt_id", attemptId);

  const { data: examQuestions } = await admin
    .from("exam_questions")
    .select("question_id, points")
    .eq("exam_id", examId);

  const { data: questions } = await admin
    .from("questions")
    .select("id, correct_option_id");

  let totalScore = 0;
  const maxScore = examQuestions?.reduce((sum, q) => sum + q.points, 0) || 0;

  if (questionAnswers && questions && examQuestions) {
    const correctMap = new Map(
      questions.map((q) => [q.id, q.correct_option_id]),
    );
    const pointsMap = new Map(
      examQuestions.map((eq) => [eq.question_id, eq.points]),
    );

    questionAnswers.forEach((a) => {
      if (a.selected_option_id === correctMap.get(a.question_id)) {
        totalScore += pointsMap.get(a.question_id) || 1;
      }
    });
  }

  // Update attempt
  await admin
    .from("attempts")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      total_score: totalScore,
      max_score: maxScore,
    })
    .eq("id", attemptId);

  // Update participant
  await admin
    .from("exam_participants")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("exam_id", examId)
    .eq("user_id", user.id);

  return NextResponse.json({ score: totalScore, maxScore });
}
