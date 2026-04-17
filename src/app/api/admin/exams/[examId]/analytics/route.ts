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

  // 1. Full exam metadata
  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  // 2. All attempts with profile data
  const { data: attempts } = await supabase
    .from("attempts")
    .select(
      `
      id,
      user_id,
      status,
      total_score,
      max_score,
      server_started_at,
      server_due_at,
      submitted_at,
      created_at,
      profiles (
        full_name,
        email,
        student_college_id
      )
    `,
    )
    .eq("exam_id", examId);

  // 3. (Removed) We compute analytics manually because the view uses `where public.is_admin()`, 
  // which filters out results since `createAdminClient` bypasses auth (auth.uid() is null).

  // 4. Get full question details for this exam
  const { data: examQuestions } = await supabase
    .from("exam_questions")
    .select(
      `
      position,
      points,
      question_id,
      questions (
        id,
        topic,
        difficulty,
        question_type,
        question,
        code_snippet,
        options,
        correct_option_id,
        explanation,
        tags
      )
    `,
    )
    .eq("exam_id", examId)
    .order("position", { ascending: true });

  // 5. All attempt answers for this exam (for per-option breakdown)
  const attemptIds = (attempts || []).map((a) => a.id);
  let allAnswers: { attempt_id: string; question_id: string; selected_option_id: string | null; is_bookmarked: boolean; is_skipped: boolean }[] = [];
  
  if (attemptIds.length > 0) {
    // Fetch in batches if needed
    const { data: answers } = await supabase
      .from("attempt_answers")
      .select("attempt_id, question_id, selected_option_id, is_bookmarked, is_skipped")
      .in("attempt_id", attemptIds);
    allAnswers = answers || [];
  }

  // 6. Participants count
  const { count: totalParticipants } = await supabase
    .from("exam_participants")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId);

  // ---- COMPUTE ANALYTICS ----

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
    ? Number(submittedAttempts[0].max_score) || 0
    : (examQuestions || []).reduce((sum, eq) => sum + (eq.points || 1), 0);

  // Grade distribution
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const passCount = { passed: 0, failed: 0 };
  scores.forEach((score) => {
    const pct = maxPossible > 0 ? (score / maxPossible) * 100 : 0;
    if (pct >= 90) gradeDistribution.A++;
    else if (pct >= 70) gradeDistribution.B++;
    else if (pct >= 50) gradeDistribution.C++;
    else if (pct >= 40) gradeDistribution.D++;
    else gradeDistribution.F++;
    
    if (pct >= 40) passCount.passed++;
    else passCount.failed++;
  });

  // Score distribution (10 buckets)
  const ranges = [
    "0-10%", "10-20%", "20-30%", "30-40%", "40-50%",
    "50-60%", "60-70%", "70-80%", "80-90%", "90-100%",
  ];
  const scoreDistribution = ranges.map((range, i) => {
    const low = i * (maxPossible / 10);
    const high = (i + 1) * (maxPossible / 10);
    const count = scores.filter(
      (s) => s >= low && (i === 9 ? s <= high : s < high),
    ).length;
    return { range, count };
  });

  interface QuestionDetail {
    id: string;
    topic: string;
    difficulty: string;
    question_type: string;
    question: string;
    code_snippet: string | null;
    options: unknown;
    correct_option_id: string;
    explanation: string;
    tags: string[];
  }

  // ---- COMPUTE QUESTION METRICS FROM SCRATCH ----
  const submittedAttemptsIds = new Set(submittedAttempts.map(a => a.id));

  // Map option IDs to specific keys 'A', 'B', 'C', 'D'
  const optionLetters = ["A", "B", "C", "D", "E", "F"];
  const optionIdToLetter = new Map<string, string>();
  (examQuestions || []).forEach(eq => {
    const q = eq.questions as unknown as QuestionDetail;
    let parsedOptions = q?.options;
    if (typeof parsedOptions === "string") {
      try { parsedOptions = JSON.parse(parsedOptions); } catch { /* ignore */ }
    }
    if (Array.isArray(parsedOptions)) {
      parsedOptions.forEach((opt, idx) => {
        if (opt.id) {
          optionIdToLetter.set(opt.id, optionLetters[idx] || "A");
        }
      });
    }
  });

  // Per-question detailed breakdown with option selection counts
  // We compute correct and wrong exclusively for SUBMITTED attempts
  const answersByQuestion = new Map<string, { A: number; B: number; C: number; D: number; skipped: number; bookmarked: number; totalSubmittedAnswers: number }>();
  allAnswers.forEach((ans) => {
    const isSubmitted = submittedAttemptsIds.has(ans.attempt_id);
    const entry = answersByQuestion.get(ans.question_id) || { A: 0, B: 0, C: 0, D: 0, skipped: 0, bookmarked: 0, totalSubmittedAnswers: 0 };
    
    if (isSubmitted) {
      entry.totalSubmittedAnswers++;
    }

    if (ans.selected_option_id) {
      const letter = optionIdToLetter.get(ans.selected_option_id) as "A" | "B" | "C" | "D" | undefined;
      // We only type A|B|C|D here to match schema
      if (isSubmitted && letter && entry[letter as keyof typeof entry] !== undefined) {
        (entry as any)[letter]++;
      }
    }
    if (isSubmitted && ans.is_skipped) entry.skipped++;
    if (isSubmitted && ans.is_bookmarked) entry.bookmarked++;
    answersByQuestion.set(ans.question_id, entry);
  });

  const detailedQuestions = (examQuestions || []).map((eq) => {
    const q = eq.questions as unknown as QuestionDetail;
    const qId = q?.id || eq.question_id;
    const optionCounts = answersByQuestion.get(qId) || { A: 0, B: 0, C: 0, D: 0, skipped: 0, bookmarked: 0, totalSubmittedAnswers: 0 };

    let parsedOptions = q?.options;
    if (typeof parsedOptions === "string") {
      try { parsedOptions = JSON.parse(parsedOptions); } catch { /* keep as-is */ }
    }

    const topic = q?.topic || "Uncategorized";
    const difficulty = q?.difficulty || "Medium";

    // Deduce correct counter directly
    const correctLetter = q?.correct_option_id as "A" | "B" | "C" | "D" | undefined;
    const correctCount = correctLetter ? (optionCounts[correctLetter as keyof typeof optionCounts] as number || 0) : 0;
    
    // total Responses that are NOT skipped
    const answeredCount = optionCounts.A + optionCounts.B + optionCounts.C + optionCounts.D;
    const wrongCount = answeredCount - correctCount;

    const correctPercentage = submittedAttempts.length > 0
      ? Math.round((correctCount / submittedAttempts.length) * 10000) / 100
      : 0;

    return {
      position: eq.position,
      points: eq.points,
      questionId: qId,
      questionText: q?.question || "",
      codeSnippet: q?.code_snippet || null,
      topic,
      difficulty,
      questionType: q?.question_type || "theory",
      options: parsedOptions,
      correctOptionId: q?.correct_option_id || "",
      explanation: q?.explanation || "",
      tags: q?.tags || [],
      correctPercentage,
      correctCount,
      wrongCount,
      skippedCount: optionCounts.skipped,
      bookmarkedCount: optionCounts.bookmarked,
      submittedAttempts: submittedAttempts.length,
      optionBreakdown: {
        A: optionCounts.A,
        B: optionCounts.B,
        C: optionCounts.C,
        D: optionCounts.D,
      },
    };
  });

  // Topic performance
  const topicMap = new Map<string, { total: number; correct: number; questions: number }>();
  detailedQuestions.forEach((q) => {
    const entry = topicMap.get(q.topic) || { total: 0, correct: 0, questions: 0 };
    entry.total += q.submittedAttempts;
    entry.correct += q.correctCount;
    entry.questions++;
    topicMap.set(q.topic, entry);
  });

  const topicPerformance = Array.from(topicMap.entries()).map(
    ([topic, data]) => ({
      topic,
      avgCorrectPct:
        data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      questionCount: data.questions,
      totalAttempts: data.total,
    }),
  );

  // Difficulty breakdown
  const difficultyMap = new Map<string, { correct: number; total: number; questions: number }>();
  detailedQuestions.forEach((q) => {
    const entry = difficultyMap.get(q.difficulty) || { correct: 0, total: 0, questions: 0 };
    entry.correct += q.correctCount;
    entry.total += q.submittedAttempts;
    entry.questions++;
    difficultyMap.set(q.difficulty, entry);
  });

  const difficultyBreakdown = Array.from(difficultyMap.entries()).map(
    ([difficulty, data]) => ({
      difficulty,
      avgCorrectPct: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      questionCount: data.questions,
    }),
  );

  // Time analytics
  const timeData = submittedAttempts
    .filter((a) => a.submitted_at && a.server_started_at)
    .map((a) => {
      const startMs = new Date(a.server_started_at).getTime();
      const submitMs = new Date(a.submitted_at!).getTime();
      return (submitMs - startMs) / 1000; // seconds
    })
    .sort((a, b) => a - b);

  const avgTimeSeconds = timeData.length
    ? timeData.reduce((a, b) => a + b, 0) / timeData.length
    : 0;

  const examDuration = exam.duration_seconds || 2400;
  const earlySubmissions = timeData.filter((t) => t < examDuration * 0.5).length;
  const onTimeSubmissions = timeData.filter((t) => t >= examDuration * 0.5 && t < examDuration * 0.9).length;
  const lateSubmissions = timeData.filter((t) => t >= examDuration * 0.9).length;

  // Student results with time-to-submit and grade
  const studentResults = submittedAttempts.map((a) => {
    const profile = a.profiles as unknown as {
      full_name: string;
      email: string;
      student_college_id: string;
    };
    const score = Number(a.total_score) || 0;
    const max = Number(a.max_score) || 0;
    const pct = max > 0 ? (score / max) * 100 : 0;
    
    let grade = "F";
    if (pct >= 90) grade = "A";
    else if (pct >= 70) grade = "B";
    else if (pct >= 50) grade = "C";
    else if (pct >= 40) grade = "D";

    let timeToSubmitSeconds: number | null = null;
    if (a.submitted_at && a.server_started_at) {
      timeToSubmitSeconds = (new Date(a.submitted_at).getTime() - new Date(a.server_started_at).getTime()) / 1000;
    }

    return {
      name: profile?.full_name || "—",
      email: profile?.email || "—",
      college_id: profile?.student_college_id || "—",
      score,
      max_score: max,
      percentage: Math.round(pct * 10) / 10,
      grade,
      timeToSubmitSeconds,
      submitted_at: a.submitted_at,
    };
  }).sort((a, b) => b.score - a.score); // Sort by score descending (leaderboard)

  // Exam health metrics
  const sortedByCorrect = [...detailedQuestions].sort((a, b) => a.correctPercentage - b.correctPercentage);
  const hardestQuestion = sortedByCorrect.length > 0 ? sortedByCorrect[0] : null;
  const easiestQuestion = sortedByCorrect.length > 0 ? sortedByCorrect[sortedByCorrect.length - 1] : null;
  const mostSkipped = [...detailedQuestions].sort((a, b) => b.skippedCount - a.skippedCount)[0] || null;
  const mostBookmarked = [...detailedQuestions].sort((a, b) => b.bookmarkedCount - a.bookmarkedCount)[0] || null;

  return NextResponse.json({
    examMeta: {
      id: exam.id,
      title: exam.title,
      examCode: exam.exam_code,
      status: exam.status,
      durationSeconds: exam.duration_seconds,
      capacity: exam.capacity,
      startsAt: exam.starts_at,
      closesAt: exam.closes_at,
      createdAt: exam.created_at,
    },
    summary: {
      totalParticipants: totalParticipants || 0,
      totalSubmitted: submittedAttempts.length,
      avgScore: Math.round(avgScore * 10) / 10,
      medianScore: Math.round(medianScore * 10) / 10,
      highestScore: scores.length ? scores[scores.length - 1] : 0,
      lowestScore: scores.length ? scores[0] : 0,
      completionRate:
        totalParticipants && totalParticipants > 0
          ? Math.round((submittedAttempts.length / totalParticipants) * 1000) / 10
          : 0,
      maxPossible,
      passRate: scores.length > 0 ? Math.round((passCount.passed / scores.length) * 1000) / 10 : 0,
      totalQuestions: detailedQuestions.length,
    },
    gradeDistribution,
    topicPerformance,
    scoreDistribution,
    difficultyBreakdown,
    detailedQuestions,
    studentResults,
    timeAnalytics: {
      avgTimeSeconds: Math.round(avgTimeSeconds),
      fastestTimeSeconds: timeData.length > 0 ? Math.round(timeData[0]) : null,
      slowestTimeSeconds: timeData.length > 0 ? Math.round(timeData[timeData.length - 1]) : null,
      earlySubmissions,
      onTimeSubmissions,
      lateSubmissions,
      examDurationSeconds: examDuration,
    },
    examHealth: {
      hardestQuestion: hardestQuestion ? { position: hardestQuestion.position, text: hardestQuestion.questionText, correctPct: hardestQuestion.correctPercentage } : null,
      easiestQuestion: easiestQuestion ? { position: easiestQuestion.position, text: easiestQuestion.questionText, correctPct: easiestQuestion.correctPercentage } : null,
      mostSkipped: mostSkipped ? { position: mostSkipped.position, text: mostSkipped.questionText, count: mostSkipped.skippedCount } : null,
      mostBookmarked: mostBookmarked ? { position: mostBookmarked.position, text: mostBookmarked.questionText, count: mostBookmarked.bookmarkedCount } : null,
    },
  });
}
