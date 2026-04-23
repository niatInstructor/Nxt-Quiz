"use client";

import { FloatingThemeToggle } from "@/components/FloatingThemeToggle";
import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";

interface Option {
  id: string;
  text: string;
}

interface ResultItem {
  id: string;
  position: number;
  points: number;
  topic: string;
  questionType: string;
  question: string;
  codeSnippet: string | null;
  options: Option[];
  correctOptionId: string | null;
  explanation: string;
  selectedOptionId: string | null;
}

export default function Submitted({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [submittedAt, setSubmittedAt] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [maxScore, setMaxScore] = useState<number | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const router = useRouter();

  const [showReview, setShowReview] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [filter, setFilter] = useState<
    "All" | "Correct" | "Incorrect" | "Skipped"
  >("All");

  useEffect(() => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document
        .exitFullscreen()
        .catch((err) => console.log("Fullscreen exit error:", err));
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // Subscribe to exam status changes
    const channel = supabase
      .channel(`exam-submitted-realtime-${examId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exams",
          filter: `id=eq.${examId}`,
        },
        (payload) => {
          if (payload.new.status === "closed") {
            // Exam closed! Refresh score and results to reveal answer key
            loadData();
            if (showReview) {
              // If review is open, force a re-fetch of answers
              setResults([]);
              setShowReview(false);
              setTimeout(() => handleToggleReview(), 100);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId, showReview]); // eslint-disable-line react-hooks/exhaustive-deps

  // BUG-07: Wrap loadData in useCallback to fix stale closure
  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/exam/${examId}/submitted-init`);
      if (!res.ok) {
        if (res.status === 401) return router.push("/login");
        return;
      }

      const data = await res.json();
      const { attempt, exam } = data;

      if (exam) {
        setExamTitle(exam.title);
        if (exam.status === "closed" && !isPublished) {
          setIsPublished(true);
        }
      }

      if (attempt) {
        setScore(attempt.total_score);
        setMaxScore(attempt.max_score);
        if (attempt.submitted_at) {
          setSubmittedAt(new Date(attempt.submitted_at).toLocaleString());
        }
      }

      setLoading(false);
    } catch (err) {
      console.error("Failed to load submitted data:", err);
    }
  }, [examId, router, isPublished]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling fallback for local development (since Realtime needs valid RLS/session)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENVIRONMENT !== "local" || isPublished) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/exam/${examId}/submitted-init`);
        if (res.ok) {
          const data = await res.json();
          if (data.exam?.status === "closed") {
            loadData();
            if (showReview) {
              setResults([]);
              setShowReview(false);
              setTimeout(() => handleToggleReview(), 100);
            }
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [examId, isPublished, loadData, showReview]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleReview = async () => {
    if (showReview) {
      setShowReview(false);
      return;
    }

    if (results.length === 0) {
      setLoadingResults(true);
      try {
        const res = await fetch(`/api/exam/${examId}/results`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setIsPublished(data.isPublished || false);
        }
      } catch {
        console.error("Failed to fetch results");
      } finally {
        setLoadingResults(false);
      }
    }
    setShowReview(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div
            className="spinner mx-auto mb-4"
            style={{ width: 48, height: 48 }}
          />
          <p className="text-muted-foreground animate-pulse font-medium">
            Finalizing your results...
          </p>
        </div>
      </div>
    );
  }

  const percentage = maxScore ? Math.round(((score || 0) / maxScore) * 100) : 0;
  const isPass = percentage >= 40;

  const filteredResults = results.filter((r) => {
    if (filter === "All") return true;
    if (!isPublished) {
      if (filter === "Skipped") return !r.selectedOptionId;
      return true;
    }
    if (filter === "Correct") return r.selectedOptionId === r.correctOptionId;
    if (filter === "Incorrect")
      return r.selectedOptionId && r.selectedOptionId !== r.correctOptionId;
    if (filter === "Skipped") return !r.selectedOptionId;
    return true;
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <FloatingThemeToggle />
      {/* ──────────────────────── HEADER / HERO ──────────────────────── */}
      <div
        className={`w-full pt-16 pb-32 px-4 text-center relative overflow-hidden transition-colors duration-700 ${
          isPass
            ? "bg-gradient-to-b from-success/10 to-transparent"
            : "bg-gradient-to-b from-danger/10 to-transparent"
        }`}
      >
        <div className="relative z-10 max-w-4xl mx-auto animate-fade-in">
          <div
            className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 shadow-2xl transition-transform hover:scale-110 duration-500 ${
              isPass
                ? "bg-success text-white rotate-12"
                : "bg-danger text-white -rotate-12"
            }`}
          >
            {isPass ? (
              <svg
                className="w-10 h-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-10 h-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground mb-3 tracking-tight">
            {isPass ? "Excellent Work!" : "Attempt Completed"}
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            You&apos;ve successfully finished the <strong>{examTitle}</strong>{" "}
            assessment.
          </p>
        </div>
      </div>

      {/* ──────────────────────── SCORE CARD ──────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 -mt-20 relative z-20">
        <div className="glass-card overflow-hidden border-none shadow-2xl bg-card backdrop-blur-xl">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-4">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Final Score
              </span>
              <div className="relative">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-border"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={364.4}
                    strokeDashoffset={364.4 - (364.4 * percentage) / 100}
                    strokeLinecap="round"
                    className={`transition-all duration-1000 ease-out ${isPass ? "text-success" : "text-danger"}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-foreground">
                    {score ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground font-bold">
                    / {maxScore ?? 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Accuracy
                </p>
                <p
                  className={`text-4xl font-black ${isPass ? "text-success" : "text-danger"}`}
                >
                  {percentage}%
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Status
                </p>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase ${
                    isPass ? "bg-success text-white" : "bg-danger text-white"
                  }`}
                >
                  {isPass ? "OH YOU PASSED" : "NEED IMPROVEMENTS"}
                </span>
              </div>
              <div className="pt-4 border-t border-border flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:col-span-2 sm:flex-row sm:items-center">
                <span className="flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {submittedAt}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-card-hover p-6 flex flex-col sm:flex-row gap-4 border-t border-border">
            <button
              onClick={handleToggleReview}
              disabled={loadingResults}
              className={`flex-1 px-8 py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-3 shadow-xl ${
                showReview
                  ? "bg-border text-foreground"
                  : "bg-primary text-white hover:bg-primary-hover hover:scale-[1.02]"
              }`}
            >
              {loadingResults ? (
                <div
                  className="spinner !border-t-white"
                  style={{ width: 18, height: 18 }}
                />
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
              {showReview ? "Hide Answers" : "Review My Responses"}
            </button>
            <button
              onClick={() => router.push("/exam/join")}
              className="flex-1 px-8 py-4 rounded-2xl text-sm font-bold bg-card border border-border text-foreground hover:bg-card-hover transition-all shadow-lg flex items-center justify-center gap-3"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────── DETAILED REVIEW ──────────────────────── */}
      {showReview && (
        <div className="max-w-4xl mx-auto px-4 mt-12 animate-slide-up">
          <div className="sticky top-6 z-40 bg-card/80 backdrop-blur-md p-2 rounded-2xl border border-border flex flex-wrap items-center justify-between gap-3 shadow-lg mb-8">
            <h2 className="px-4 text-sm font-bold text-foreground">
              Examination Review
            </h2>
            <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
              {(["All", "Correct", "Incorrect", "Skipped"] as const).map(
                (f) => {
                  // If results are not published, only show All and Skipped filters
                  if (!isPublished && (f === "Correct" || f === "Incorrect"))
                    return null;

                  const count = results.filter((r) => {
                    if (f === "All") return true;
                    if (!isPublished && f === "Skipped")
                      return !r.selectedOptionId;
                    if (f === "Correct")
                      return r.selectedOptionId === r.correctOptionId;
                    if (f === "Incorrect")
                      return (
                        r.selectedOptionId &&
                        r.selectedOptionId !== r.correctOptionId
                      );
                    if (f === "Skipped") return !r.selectedOptionId;
                    return true;
                  }).length;

                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                        filter === f
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-card-hover"
                      }`}
                    >
                      {f} <span className="opacity-50">{count}</span>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <div className="space-y-6">
            {filteredResults.map((r) => {
              const isCorrect =
                isPublished && r.selectedOptionId === r.correctOptionId;
              const isWrong =
                isPublished &&
                r.selectedOptionId &&
                r.selectedOptionId !== r.correctOptionId;
              const isSkipped = !r.selectedOptionId;

              return (
                <div
                  key={r.id}
                  className={`glass-card overflow-hidden border-l-8 ${
                    isPublished
                      ? isCorrect
                        ? "border-l-success"
                        : isSkipped
                          ? "border-l-amber-500"
                          : "border-l-danger"
                      : "border-l-primary"
                  }`}
                >
                  <div className="p-6 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Question {results.findIndex((i) => i.id === r.id) + 1}
                      </span>
                      {isPublished && (
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            isCorrect
                              ? "bg-success/10 text-success"
                              : isSkipped
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-danger/10 text-danger"
                          }`}
                        >
                          {isCorrect
                            ? "Correct"
                            : isSkipped
                              ? "Skipped"
                              : "Incorrect"}
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl font-bold text-foreground">
                      {r.question}
                    </h3>

                    {r.codeSnippet && (
                      <pre className="code-block p-6 rounded-2xl overflow-x-auto text-sm">
                        <code>{r.codeSnippet}</code>
                      </pre>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {r.options.map((opt) => {
                        const isUserChoice = opt.id === r.selectedOptionId;
                        const isTheCorrectAnswer =
                          isPublished && opt.id === r.correctOptionId;

                        let stateClass =
                          "border-border bg-card text-muted-foreground";

                        if (isTheCorrectAnswer) {
                          stateClass =
                            "border-success bg-success/5 text-success font-bold";
                        } else if (isUserChoice && isWrong) {
                          stateClass =
                            "border-danger bg-danger/5 text-danger font-bold";
                        } else if (isUserChoice && !isPublished) {
                          stateClass =
                            "border-primary bg-primary/5 text-primary font-bold shadow-[0_0_15px_rgba(79,70,229,0.1)]";
                        }

                        return (
                          <div
                            key={opt.id}
                            className={`relative p-4 rounded-2xl border-2 transition-all flex items-start gap-4 overflow-hidden ${stateClass}`}
                          >
                            <div
                              className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-black ${
                                isTheCorrectAnswer
                                  ? "bg-success text-white"
                                  : isUserChoice && isWrong
                                    ? "bg-danger text-white"
                                    : isUserChoice && !isPublished
                                      ? "bg-primary text-white"
                                      : "bg-card-hover"
                              }`}
                            >
                              {opt.id}
                            </div>
                            <span className="text-sm pt-0.5 flex-1">
                              {opt.text}
                            </span>

                            {isUserChoice && (
                              <span className="absolute -top-2.5 right-4 px-2 py-0.5 bg-foreground text-background text-[9px] font-black rounded-full uppercase">
                                Your Choice
                              </span>
                            )}
                            {isTheCorrectAnswer && !isUserChoice && (
                              <span className="absolute -top-2.5 right-4 px-2 py-0.5 bg-success text-white text-[9px] font-black rounded-full uppercase">
                                Correct Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isPublished && r.explanation && (
                      <div className="mt-4 p-5 rounded-2xl bg-card-hover border border-border">
                        <p className="text-xs font-black uppercase tracking-widest text-foreground mb-2">
                          Explanation
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {r.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
