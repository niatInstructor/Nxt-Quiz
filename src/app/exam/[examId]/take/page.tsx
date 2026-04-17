"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";

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

export default function TakeExam({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

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
    // Initial enter
    enterFullScreen();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, [enterFullScreen]);

  // Load exam data
  useEffect(() => {
    const loadExam = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Get attempt
      const { data: attempt } = await supabase
        .from("attempts")
        .select("id, server_due_at, status")
        .eq("exam_id", examId)
        .eq("user_id", user.id)
        .single();

      if (!attempt) {
        router.push("/exam/join");
        return;
      }

      if (attempt.status === "submitted") {
        router.push(`/exam/${examId}/submitted`);
        return;
      }

      setAttemptId(attempt.id);

      // Calculate time remaining using server time
      const { data: serverTimeData } = await supabase.rpc("get_server_time");
      const serverNow = serverTimeData
        ? new Date(serverTimeData).getTime()
        : Date.now();
      const dueAt = new Date(attempt.server_due_at).getTime();
      const remaining = Math.max(0, Math.floor((dueAt - serverNow) / 1000));
      setTimeLeft(remaining);

      // Get questions (without correct answers — view includes them)
      const { data: examQuestions } = await supabase
        .from("student_exam_questions")
        .select("id, topic, difficulty, question_type, question, code_snippet, options, position, points")
        .eq("exam_id", examId)
        .order("position");

      if (examQuestions) {
        const enriched = examQuestions.map((eq) => {
          return {
            ...eq,
            options:
              typeof eq.options === "string"
                ? JSON.parse(eq.options)
                : eq.options,
            questionType: eq.question_type || "theory",
            codeSnippet: eq.code_snippet || null,
          };
        });

        // Shuffle questions using attempt ID as seed
        const shuffled = shuffleArray(enriched, attempt.id);
        setQuestions(shuffled);
      }

      // Load existing answers
      const { data: existingAnswers } = await supabase
        .from("attempt_answers")
        .select("question_id, selected_option_id, is_bookmarked, is_skipped")
        .eq("attempt_id", attempt.id);

      if (existingAnswers) {
        const answerMap: Record<string, AnswerState> = {};
        existingAnswers.forEach((a) => {
          answerMap[a.question_id] = {
            selected_option_id: a.selected_option_id,
            is_bookmarked: a.is_bookmarked,
            is_skipped: a.is_skipped,
          };
        });
        setAnswers(answerMap);
      }

      setLoading(false);
    };

    loadExam();
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

  const handleAutoSubmit = async () => {
    if (!attemptId) return;
    try {
      await fetch(`/api/exam/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
    } catch {
      // ignore
    }
    router.push(`/exam/${examId}/submitted`);
  };

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
    [attemptId, examId]
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
    if (!a)
      return "unanswered";
    if (a.selected_option_id) return "answered";
    if (a.is_bookmarked) return "bookmarked";
    if (a.is_skipped) return "skipped";
    return "unanswered";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="spinner mx-auto mb-4" style={{ width: 40, height: 40 }} />
          <p className="text-muted-foreground">Loading exam...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const currentAnswer = answers[currentQuestion.id];
  const isUrgent = timeLeft !== null && timeLeft < 300;

  const answeredCount = Object.values(answers).filter(
    (a) => a.selected_option_id
  ).length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
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

          <div className="flex items-center gap-4">
            {/* Save indicator */}
            {saving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <div className="spinner" style={{ width: 12, height: 12 }} />
                Saving
              </span>
            )}

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

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Main content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-3xl mx-auto animate-fade-in" key={currentIndex}>
            {/* Question */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground leading-relaxed">
                {currentQuestion.question}
              </h2>
            </div>

            {/* Code snippet */}
            {currentQuestion.questionType === "code-output" &&
              currentQuestion.codeSnippet && (
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
                    onClick={() =>
                      selectOption(currentQuestion.id, option.id)
                    }
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
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleBookmark(currentQuestion.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    currentAnswer?.is_bookmarked
                      ? "bg-secondary/15 text-secondary border border-secondary/30"
                      : "bg-card border border-border text-muted-foreground hover:border-border-hover"
                  }`}
                >
                  <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>{currentAnswer?.is_bookmarked ? "Bookmarked" : "Bookmark"}</span>
                </button>
                <button
                  onClick={() => skipQuestion(currentQuestion.id)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-card border border-border text-muted-foreground hover:border-border-hover transition-all"
                >
                  <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>Skip</span>
                </button>
                {currentAnswer?.selected_option_id && (
                  <button
                    onClick={() => clearAnswer(currentQuestion.id)}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-all"
                  >
                    <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Clear</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setCurrentIndex(Math.max(0, currentIndex - 1))
                  }
                  disabled={currentIndex === 0}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium bg-card border border-border text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-card-hover transition-all"
                >
                  ← Previous
                </button>
                {currentIndex === questions.length - 1 ? (
                  <button
                    onClick={() =>
                      router.push(`/exam/${examId}/review`)
                    }
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary"
                  >
                    Review & Submit →
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      setCurrentIndex(
                        Math.min(questions.length - 1, currentIndex + 1)
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
          className={`w-72 border-l border-border p-4 overflow-y-auto sticky top-16 h-[calc(100vh-4rem)] transition-all ${
            showNav ? "" : "hidden"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Questions
            </h3>
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

      {/* Full screen enforcement modal */}
      {!isFullScreen && !loading && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
          <div className="glass-card p-8 max-w-md w-full text-center animate-slide-up shadow-2xl border-primary/20">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Full Screen Required</h2>
            <p className="text-muted-foreground mb-8 text-sm">
              To maintain the integrity of the examination, you must stay in full screen mode. Leaving full screen is recorded as an event.
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
