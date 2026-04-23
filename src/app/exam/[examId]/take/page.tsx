"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect, useCallback, useRef, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Question {
  id: string;
  topic: string;
  difficulty: string;
  question: string;
  questionType?: string;
  codeSnippet?: string;
  options: { id: string; text: string }[];
  position: number;
  points: number;
}

interface AnswerState {
  selected_option_id: string | null;
  is_bookmarked: boolean;
  is_skipped: boolean;
}

interface ApiExamQuestion extends Omit<
  Question,
  "questionType" | "codeSnippet" | "options"
> {
  options: string | Question["options"];
  question_type?: string | null;
  code_snippet?: string | null;
}

interface ExistingAnswer {
  question_id: string;
  selected_option_id: string | null;
  is_bookmarked: boolean;
  is_skipped: boolean;
}

// Seeded PRNG for deterministic shuffle
function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return function () {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: T[], seed: string): T[] {
  const shuffled = [...arr];
  const rng = seededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function TakeExamContent({ examId }: { examId: string }) {
  const searchParams = useSearchParams();
  const startQuestionId = searchParams.get("q");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [serverDrift, setServerDrift] = useState(0); // diff between server and local clock
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // BUG-05: Use ref to avoid stale closure in timer callback
  const attemptIdRef = useRef<string | null>(null);

  // Smart Navigation: Jump to specific question when query param 'q' changes
  useEffect(() => {
    if (startQuestionId && questions.length > 0) {
      const index = questions.findIndex((q) => q.id === startQuestionId);
      if (index !== -1) {
        setCurrentIndex(index);
      }
    }
  }, [startQuestionId, questions]);

  const [showNav, setShowNav] = useState(true);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Proctoring: Detect Tab Switch
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && attemptId && !loading) {
        // Only trigger if attempt is active and loaded
        setShowTabWarning(true);
        try {
          // SEC-11: No client-supplied attemptId — server derives it from session
          await fetch(`/api/exam/${examId}/proctor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        } catch (err) {
          console.error("Failed to report proctoring event:", err);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [attemptId, examId, loading]);

  // Proctoring: Prevent Right Click and Copy
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleCopy = (e: ClipboardEvent) => e.preventDefault();

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
    };
  }, []);

  // Realtime subscription for time extensions
  useEffect(() => {
    if (!attemptId) return;
    const supabase = createClient();

    // 1. Listen to personal attempt updates
    const attemptChannel = supabase
      .channel(`attempt-realtime-${attemptId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "attempts",
          filter: `id=eq.${attemptId}`,
        },
        (payload) => {
          const newDueAt = payload.new.server_due_at;
          if (newDueAt) {
            const dueAtMs = new Date(newDueAt).getTime();
            const nowMs = Date.now() + serverDrift;
            const remaining = Math.max(0, Math.floor((dueAtMs - nowMs) / 1000));
            setTimeLeft(remaining);
            console.log(
              "⏰ Time extended (Personal)! New remaining:",
              remaining,
            );
          }
        },
      )
      .subscribe();

    // 2. Listen to global exam updates (Double Check)
    const examChannel = supabase
      .channel(`exam-realtime-global-${examId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exams",
          filter: `id=eq.${examId}`,
        },
        (payload) => {
          const newClosesAt = payload.new.closes_at;
          if (newClosesAt) {
            const dueAtMs = new Date(newClosesAt).getTime();
            const nowMs = Date.now() + serverDrift;
            const remaining = Math.max(0, Math.floor((dueAtMs - nowMs) / 1000));
            setTimeLeft(remaining);
            console.log("🌍 Time extended (Global)! New remaining:", remaining);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attemptChannel);
      supabase.removeChannel(examChannel);
    };
  }, [attemptId, examId, serverDrift]);

  // Full screen management
  const enterFullScreen = useCallback(() => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    // Initial check

    setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullScreenChange);

    // REMOVED: Initial enterFullScreen call to avoid "user gesture" error

    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, []); // enterFullScreen removed from deps as it's stable from useCallback

  // Load exam data
  useEffect(() => {
    const loadExam = async () => {
      try {
        const res = await fetch(`/api/exam/${examId}/take-init`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
          } else if (res.status === 404) {
            router.push("/exam/join");
          }
          return;
        }

        const data = await res.json();
        const {
          attempt,
          questions: examQuestions,
          answers: existingAnswers,
          serverNow,
        } = data;

        if (attempt.status === "submitted") {
          router.push(`/exam/${examId}/submitted`);
          return;
        }

        setAttemptId(attempt.id);
        attemptIdRef.current = attempt.id;

        setServerDrift(serverNow - Date.now());

        const dueAt = new Date(attempt.server_due_at).getTime();
        const remaining = Math.max(0, Math.floor((dueAt - serverNow) / 1000));
        setTimeLeft(remaining);

        if (examQuestions && examQuestions.length > 0) {
          const enriched: Question[] = (examQuestions as ApiExamQuestion[]).map(
            (eq) => ({
              ...eq,
              options:
                typeof eq.options === "string"
                  ? JSON.parse(eq.options)
                  : eq.options,
              questionType: eq.question_type || "theory",
              codeSnippet: eq.code_snippet || undefined,
            }),
          );

          const shuffled = shuffleArray(enriched, attempt.id);
          setQuestions(shuffled);
        } else {
          // If no questions found, redirect to join with error
          console.error("No questions found for this exam");
        }

        if (existingAnswers) {
          const answerMap: Record<string, AnswerState> = {};
          (existingAnswers as ExistingAnswer[]).forEach((a) => {
            answerMap[a.question_id] = {
              selected_option_id: a.selected_option_id,
              is_bookmarked: a.is_bookmarked,
              is_skipped: a.is_skipped,
            };
          });
          setAnswers(answerMap);
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to load exam:", err);
      }
    };

    loadExam();
  }, [examId, router]);

  // BUG-05: Use ref-based auto-submit to avoid stale closure
  const handleAutoSubmit = useCallback(async () => {
    const id = attemptIdRef.current;
    if (!id) return;
    try {
      await fetch(`/api/exam/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: id }),
      });
    } catch {
      // ignore
    }
    router.push(`/exam/${examId}/submitted`);
  }, [examId, router]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft !== null]);

  // Save answer with debounce
  const saveAnswer = useCallback(
    (questionId: string, state: AnswerState) => {
      if (!attemptId) return;

      setSaving(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        await fetch(`/api/exam/${examId}/answer`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            questionId,
            ...state,
          }),
        });
        setSaving(false);
      }, 500);
    },
    [attemptId, examId],
  );

  const selectOption = (questionId: string, optionId: string) => {
    const newState: AnswerState = {
      ...(answers[questionId] || {
        selected_option_id: null,
        is_bookmarked: false,
        is_skipped: false,
      }),
      selected_option_id: optionId,
      is_skipped: false,
    };
    setAnswers((prev) => ({ ...prev, [questionId]: newState }));
    saveAnswer(questionId, newState);
  };

  const clearAnswer = (questionId: string) => {
    const newState: AnswerState = {
      ...(answers[questionId] || {
        selected_option_id: null,
        is_bookmarked: false,
        is_skipped: false,
      }),
      selected_option_id: null,
    };
    setAnswers((prev) => ({ ...prev, [questionId]: newState }));
    saveAnswer(questionId, newState);
  };

  const toggleBookmark = (questionId: string) => {
    const current = answers[questionId] || {
      selected_option_id: null,
      is_bookmarked: false,
      is_skipped: false,
    };
    const newState: AnswerState = {
      ...current,
      is_bookmarked: !current.is_bookmarked,
    };
    setAnswers((prev) => ({ ...prev, [questionId]: newState }));
    saveAnswer(questionId, newState);
  };

  const skipQuestion = (questionId: string) => {
    const current = answers[questionId] || {
      selected_option_id: null,
      is_bookmarked: false,
      is_skipped: false,
    };
    if (!current.selected_option_id) {
      const newState: AnswerState = { ...current, is_skipped: true };
      setAnswers((prev) => ({ ...prev, [questionId]: newState }));
      saveAnswer(questionId, newState);
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      router.push(`/exam/${examId}/review`);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getQuestionStatus = (qId: string) => {
    const a = answers[qId];
    if (!a) return "unanswered";
    if (a.selected_option_id) return "answered";
    if (a.is_bookmarked) return "bookmarked";
    if (a.is_skipped) return "skipped";
    return "unanswered";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div
            className="spinner mx-auto mb-4"
            style={{ width: 40, height: 40 }}
          />
          <p className="text-muted-foreground">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            No Questions Found
          </h2>
          <p className="text-muted-foreground mb-8">
            This exam doesn&apos;t seem to have any questions assigned yet.
            Please contact the administrator.
          </p>
          <button
            onClick={() => router.push("/exam/join")}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const currentAnswer = answers[currentQuestion.id];
  const isUrgent = timeLeft !== null && timeLeft < 300;

  const answeredCount = Object.values(answers).filter(
    (a) => a.selected_option_id,
  ).length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              Q {currentIndex + 1}/{questions.length}
            </span>
            <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-border/50">
              {currentQuestion.topic}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-lg ${
                currentQuestion.difficulty === "Intermediate"
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success"
              }`}
            >
              {currentQuestion.difficulty}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Save indicator */}
            {saving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <div className="spinner" style={{ width: 12, height: 12 }} />
                Saving
              </span>
            )}

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Progress */}
            <span className="text-xs text-muted-foreground">
              {answeredCount}/{questions.length} answered
            </span>

            {/* Timer */}
            {timeLeft !== null && (
              <div
                className={`px-4 py-2 rounded-xl font-mono font-bold text-lg ${
                  isUrgent
                    ? "bg-danger/10 text-danger animate-timer-urgent"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-3xl mx-auto animate-fade-in" key={currentIndex}>
            {/* Question */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground leading-relaxed">
                {currentQuestion.question}
              </h2>
            </div>

            {/* Code snippet */}
            {currentQuestion.codeSnippet && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Code
                  </span>
                  <span className="text-xs text-muted px-2 py-0.5 rounded bg-border/50">
                    React / JSX
                  </span>
                </div>
                <pre className="code-block whitespace-pre-wrap">
                  <code>{currentQuestion.codeSnippet}</code>
                </pre>
              </div>
            )}

            {/* Options */}
            <div className="space-y-3">
              {currentQuestion.options.map((option) => {
                const isSelected =
                  currentAnswer?.selected_option_id === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => selectOption(currentQuestion.id, option.id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 hover:scale-[1.01] ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card hover:border-border-hover hover:bg-card-hover text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm ${
                          isSelected
                            ? "bg-primary text-white"
                            : "bg-border/50 text-muted-foreground"
                        }`}
                      >
                        {option.id}
                      </span>
                      <span className="pt-1 text-sm leading-relaxed">
                        {option.text}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-border lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => toggleBookmark(currentQuestion.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    currentAnswer?.is_bookmarked
                      ? "bg-secondary/15 text-secondary border border-secondary/30"
                      : "bg-card border border-border text-muted-foreground hover:border-border-hover"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
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
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                      />
                    </svg>
                    {currentAnswer?.is_bookmarked ? "Bookmarked" : "Bookmark"}
                  </span>
                </button>
                <button
                  onClick={() => skipQuestion(currentQuestion.id)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-card border border-border text-muted-foreground hover:border-border-hover transition-all"
                >
                  <span className="flex items-center gap-1.5">
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
                    </svg>
                    Skip
                  </span>
                </button>
                {currentAnswer?.selected_option_id && (
                  <button
                    onClick={() => clearAnswer(currentQuestion.id)}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-all"
                  >
                    <span className="flex items-center gap-1.5">
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
                      </svg>
                      Clear
                    </span>
                  </button>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium bg-card border border-border text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-card-hover transition-all"
                >
                  ← Previous
                </button>
                {currentIndex === questions.length - 1 ? (
                  <button
                    onClick={() => router.push(`/exam/${examId}/review`)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary"
                  >
                    Review & Submit →
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      setCurrentIndex(
                        Math.min(questions.length - 1, currentIndex + 1),
                      )
                    }
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Question navigator sidebar */}
        <aside
          className={`w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] transition-all ${
            showNav ? "" : "hidden"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Questions</h3>
            <button
              onClick={() => setShowNav(false)}
              className="text-muted hover:text-foreground text-xs"
            >
              Hide
            </button>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-success/30 border border-success/50" />
              <span className="text-muted-foreground">Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-warning/30 border border-warning/50" />
              <span className="text-muted-foreground">Skipped</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-secondary/30 border border-secondary/50" />
              <span className="text-muted-foreground">Bookmarked</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-border/50 border border-border" />
              <span className="text-muted-foreground">Unanswered</span>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, i) => {
              const status = getQuestionStatus(q.id);
              const isCurrent = i === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`q-dot ${isCurrent ? "current" : status}`}
                  title={`Question ${i + 1} - ${status}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Review button */}
          <div className="mt-6">
            <button
              onClick={() => router.push(`/exam/${examId}/review`)}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary"
            >
              Review & Submit
            </button>
          </div>
        </aside>

        {/* Show nav toggle when hidden */}
        {!showNav && (
          <button
            onClick={() => setShowNav(true)}
            className="fixed right-4 bottom-4 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-50"
            title="Show question navigator"
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
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Tab Switch Warning Modal */}
      {showTabWarning && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card p-8 max-w-md w-full text-center animate-slide-up shadow-2xl border-danger/30">
            <div className="w-20 h-20 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-danger"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Warning!
            </h2>
            <p className="text-danger font-semibold mb-4 text-lg">
              What&apos;s up, Seems Like you cheated by tab switching
            </p>
            <p className="text-muted-foreground mb-8 text-sm">
              Your activity has been logged and reported to the administrator.
              Multiple violations may lead to disqualification.
            </p>
            <button
              onClick={() => setShowTabWarning(false)}
              className="w-full py-4 rounded-2xl bg-danger text-white font-bold text-lg hover:bg-danger-hover hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-danger/20"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* Full screen enforcement modal */}
      {!isFullScreen && !loading && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
          <div className="glass-card p-8 max-w-md w-full text-center animate-slide-up shadow-2xl border-primary/20">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Full Screen Required
            </h2>
            <p className="text-muted-foreground mb-8 text-sm">
              To maintain the integrity of the examination, you must stay in
              full screen mode. Leaving full screen is recorded as an event.
            </p>
            <button
              onClick={enterFullScreen}
              className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary shadow-xl"
            >
              Enter Full Screen to Continue
            </button>
            <p className="mt-6 text-[10px] text-muted-foreground uppercase tracking-widest">
              Standard Examination Protocol
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TakeExam({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      }
    >
      <TakeExamContent examId={examId} />
    </Suspense>
  );
}
