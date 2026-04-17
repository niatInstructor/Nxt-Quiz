"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect, use } from "react";
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
  correctOptionId: string;
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
  const router = useRouter();

  const [showReview, setShowReview] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    // Exit full screen automatically upon reaching the submitted page
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document
        .exitFullscreen()
        .catch((err) => console.log("Fullscreen exit error:", err));
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      const { data: attempt } = await supabase
        .from("attempts")
        .select("submitted_at, status, total_score, max_score")
        .eq("exam_id", examId)
        .eq("user_id", user.id)
        .single();

      const { data: exam } = await supabase
        .from("exams")
        .select("title")
        .eq("id", examId)
        .single();

      if (exam) {
        setExamTitle(exam.title);
      }

      if (attempt?.submitted_at) {
        setSubmittedAt(new Date(attempt.submitted_at).toLocaleString());
      }

      if (attempt) {
        setScore(attempt.total_score);
        setMaxScore(attempt.max_score);
      }

      setLoading(false);
    };
    loadData();
  }, [examId, router]);

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const percentage = maxScore ? Math.round(((score || 0) / maxScore) * 100) : 0;
  const isPass = percentage >= 50;

  return (
    <div className="min-h-screen py-12 px-4 flex flex-col items-center overflow-y-auto">
      <div
        className={`w-full transition-all duration-500 ease-in-out ${showReview ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className="text-center animate-slide-up">
          {/* Main Success/Failure icon and Header */}
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 shadow-sm ${
              isPass ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {isPass ? (
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">
            Exam Submitted
          </h1>
          <p className="text-base text-muted-foreground mb-6">
            {examTitle || "Your assessment"} has been recorded.
          </p>

          <div
            className={`glass-card p-6 mb-8 border ${isPass ? "border-success/20 shadow-[0_4px_20px_rgba(22,163,74,0.1)] bg-success/[0.02]" : "border-danger/20 shadow-[0_4px_20px_rgba(220,38,38,0.1)] bg-danger/[0.02]"}`}
          >
            <div className="mb-6 text-center">
              <p className="text-sm text-muted-foreground mb-2 uppercase tracking-widest font-semibold">
                Final Score
              </p>
              <div className="flex items-baseline justify-center gap-2">
                <span
                  className={`text-5xl font-black ${isPass ? "text-success" : "text-danger"}`}
                >
                  {score ?? 0}
                </span>
                <span className="text-2xl text-muted-foreground font-medium">
                  / {maxScore ?? 0}
                </span>
              </div>
            </div>

            <div className="w-full bg-muted/40 h-3 rounded-full overflow-hidden mb-6 relative">
              <div
                className={`h-full transition-all duration-1500 ease-out absolute left-0 top-0 ${isPass ? "bg-success" : "bg-danger"}`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mt-2">
              <div className="p-4 rounded-xl bg-card border border-border flex flex-col items-center justify-center text-center">
                <p className="text-muted-foreground text-xs mb-1 uppercase tracking-wider">
                  Accuracy
                </p>
                <p className="text-foreground font-bold text-xl">
                  {percentage}%
                </p>
              </div>
              <div
                className={`p-4 rounded-xl border flex flex-col items-center justify-center text-center ${isPass ? "bg-success/5 border-success/30" : "bg-danger/5 border-danger/30"}`}
              >
                <p className="text-muted-foreground text-xs mb-1 uppercase tracking-wider">
                  Status
                </p>
                <p
                  className={`font-black text-xl uppercase tracking-wider ${isPass ? "text-success" : "text-danger"}`}
                >
                  {isPass ? "OH YOU PASSED!" : "NEED IMPROVEMENTS :-)"}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-border/50 text-xs text-muted-foreground text-center">
              <p>
                <span className="font-medium">Timestamp:</span>{" "}
                {submittedAt || "Processing..."}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <button
              onClick={handleToggleReview}
              className="flex-1 px-6 py-4 rounded-2xl text-sm font-bold bg-primary text-white hover:bg-primary-hover transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {loadingResults ? (
                <div
                  className="spinner"
                  style={{ width: 16, height: 16, borderTopColor: "white" }}
                />
              ) : (
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              )}
              {showReview ? "Hide Answers" : "Review Answers"}
            </button>
            <button
              onClick={() => router.push("/exam/join")}
              className="flex-1 px-6 py-4 rounded-2xl text-sm font-bold bg-card border border-border text-foreground hover:bg-card-hover transition-all shadow-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* RESULTS REVIEW SECTION */}
        {showReview && results.length > 0 && (
          <div className="animate-slide-up space-y-6 pt-8 border-t border-border mt-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Detailed Answers
            </h2>

            {results.map((r, index) => {
              const isCorrect = r.selectedOptionId === r.correctOptionId;
              const isSkipped = !r.selectedOptionId;

              return (
                <div key={r.id} className="glass-card p-6 border border-border">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center font-bold text-sm text-foreground">
                        {index + 1}
                      </span>
                      <div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-border/50 text-muted-foreground uppercase tracking-wide">
                          {r.topic}
                        </span>
                      </div>
                    </div>
                    {isCorrect ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-lg">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>{" "}
                        Correct
                      </span>
                    ) : isSkipped ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-warning bg-warning/10 px-2 py-1 rounded-lg">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 5l7 7-7 7M5 5l7 7-7 7"
                          />
                        </svg>{" "}
                        Skipped
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-danger bg-danger/10 px-2 py-1 rounded-lg">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>{" "}
                        Incorrect
                      </span>
                    )}
                  </div>

                  <p className="text-lg font-medium text-foreground mb-4 leading-relaxed">
                    {r.question}
                  </p>

                  {r.questionType === "code-output" && r.codeSnippet && (
                    <div className="mb-4 text-left">
                      <pre className="code-block whitespace-pre-wrap text-sm">
                        <code>{r.codeSnippet}</code>
                      </pre>
                    </div>
                  )}

                  <div className="space-y-2 mb-4 text-left">
                    {r.options.map((opt) => {
                      const isOpCorrect = opt.id === r.correctOptionId;
                      const isOpSelected = opt.id === r.selectedOptionId;

                      let optionClasses =
                        "p-3 rounded-xl border transition-all text-sm flex items-start gap-3 ";

                      if (isOpCorrect) {
                        optionClasses +=
                          "border-success bg-success/5 text-success";
                      } else if (isOpSelected && !isOpCorrect) {
                        optionClasses +=
                          "border-danger bg-danger/5 text-danger";
                      } else {
                        optionClasses +=
                          "border-border bg-card text-muted-foreground opacity-50";
                      }

                      return (
                        <div key={opt.id} className={optionClasses}>
                          <span
                            className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center font-bold text-xs ${
                              isOpCorrect
                                ? "bg-success text-white"
                                : isOpSelected
                                  ? "bg-danger text-white"
                                  : "bg-border text-muted-foreground"
                            }`}
                          >
                            {opt.id}
                          </span>
                          <span className="pt-0.5 leading-tight">
                            {opt.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {r.explanation && (
                    <div className="mt-4 p-4 rounded-xl bg-card border border-border text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <svg
                          className="w-4 h-4 text-primary"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm font-semibold text-foreground">
                          Explanation
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed pl-6">
                        {r.explanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
