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

  // Exam info
  const { data: exam } = await supabase
    .from("exams")
    .select("title")
    .eq("id", examId)
    .single();

  // All attempts
  const { data: attempts } = await supabase
    .from("attempts")
    .select(
      `
      id,
      user_id,
      status,
      total_score,
      max_score,
      submitted_at,
      profiles (
        full_name,
        email,
        student_college_id
      )
    `,
    )
    .eq("exam_id", examId);

  // Question analytics
  const { data: questionMetrics } = await supabase
    .from("exam_question_analytics")
    .select("*")
    .eq("exam_id", examId);

  // Participants count
  const { count: totalParticipants } = await supabase
    .from("exam_participants")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId);

  // Compute analytics
  const submittedAttempts = (attempts || []).filter(
    (a) => a.status === "submitted",
  );
  const scores = submittedAttempts
    .map((a) => Number(a.total_score) || 0)
    .sort((a, b) => a - b);

  const avgScore = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  const medianScore = scores.length
    ? scores.length % 2 === 0
      ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
      : scores[Math.floor(scores.length / 2)]
    : 0;

  const maxPossible = submittedAttempts.length
    ? Number(submittedAttempts[0].max_score) || 50
    : 50;

  // Topic performance
  const topicMap = new Map<string, { total: number; correct: number }>();
  (questionMetrics || []).forEach((q) => {
    const entry = topicMap.get(q.topic) || { total: 0, correct: 0 };
    entry.total += Number(q.submitted_attempts) || 0;
    entry.correct += Number(q.correct_count) || 0;
    topicMap.set(q.topic, entry);
  });

  const topicPerformance = Array.from(topicMap.entries()).map(
    ([topic, data]) => ({
      topic,
      avgCorrectPct:
        data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      count: data.total,
    }),
  );

  // Score distribution
  const ranges = [
    "0-10%",
    "10-20%",
    "20-30%",
    "30-40%",
    "40-50%",
    "50-60%",
    "60-70%",
    "70-80%",
    "80-90%",
    "90-100%",
  ];
  const scoreDistribution = ranges.map((range, i) => {
    const low = i * (maxPossible / 10);
    const high = (i + 1) * (maxPossible / 10);
    const count = scores.filter(
      (s) => s >= low && (i === 9 ? s <= high : s < high),
    ).length;
    return { range, count };
  });

  // Student results
  const studentResults = submittedAttempts.map((a) => {
    const profile = a.profiles as unknown as {
      full_name: string;
      email: string;
      student_college_id: string;
    };
    return {
      name: profile?.full_name || "—",
      email: profile?.email || "—",
      college_id: profile?.student_college_id || "—",
      score: Number(a.total_score) || 0,
      max_score: Number(a.max_score) || 0,
      submitted_at: a.submitted_at,
    };
  });

  return NextResponse.json({
    examTitle: exam?.title || "Exam",
    summary: {
      totalParticipants: totalParticipants || 0,
      totalSubmitted: submittedAttempts.length,
      avgScore,
      medianScore,
      highestScore: scores.length ? scores[scores.length - 1] : 0,
      lowestScore: scores.length ? scores[0] : 0,
      completionRate:
        totalParticipants && totalParticipants > 0
          ? (submittedAttempts.length / totalParticipants) * 100
          : 0,
      maxPossible,
    },
    topicPerformance,
    questionMetrics: questionMetrics || [],
    scoreDistribution,
    studentResults,
  });
}
