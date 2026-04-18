"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

interface AnswerState {
  question_id: string;
  selected_option_id: string | null;
  is_bookmarked: boolean;
  is_skipped: boolean;
}

interface Question {
  id: string;
  topic: string;
  question: string;
  position: number;
}

export default function ReviewExam({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<AnswerState[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isOpeningConfirm, setIsOpeningConfirm] = useState(false);
  const [navigatingToQuestion, setNavigatingToQuestion] = useState<string | null>(null);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [serverDrift, setServerDrift] = useState(0); // diff between server and local clock
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Proctoring: Detect Tab Switch
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (attemptId && document.hidden && !loading) {
        setShowTabWarning(true);
        try {
          await fetch(`/api/exam/${examId}/proctor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId }),
          });
        } catch (err) {
          console.error("Failed to report proctoring event:", err);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [attemptId, examId, loading]);

  // Realtime subscription for time extensions
  useEffect(() => {
    if (!attemptId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`attempt-updates-review-${attemptId}`)
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
            console.log("Time extended (Review Page)! New remaining:", remaining);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [attemptId, serverDrift]);

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let userId = user?.id;
      if (!userId && process.env.ENVIRONMENT === "local") {
        userId = "00000000-0000-0000-0000-000000000001";
      }

      if (!userId) return router.push("/login");

      const { data: attempt } = await supabase
        .from("attempts")
        .select("id, server_due_at, status")
        .eq("exam_id", examId)
        .eq("user_id", userId)
        .single();

      if (!attempt || attempt.status === "submitted") {
        return router.push(`/exam/${examId}/submitted`);
      }
      setAttemptId(attempt.id);

      // Calculate time remaining using server time and store drift
      const { data: serverTimeData } = await supabase.rpc("get_server_time");
      const serverNow = serverTimeData
        ? new Date(serverTimeData).getTime()
        : Date.now();
      
      setServerDrift(serverNow - Date.now());

      const dueAt = new Date(attempt.server_due_at).getTime();
      const remaining = Math.max(0, Math.floor((dueAt - serverNow) / 1000));
      setTimeLeft(remaining);

      const { data: examQs } = await supabase
        .from("student_exam_questions")
        .select("id, topic, question, position")
        .eq("exam_id", examId)
        .order("position");

      if (examQs) setQuestions(examQs);

      const { data: ans } = await supabase
        .from("attempt_answers")
        .select("question_id, selected_option_id, is_bookmarked, is_skipped")
        .eq("attempt_id", attempt.id);

      if (ans) setAnswers(ans);
      setLoading(false);
    };
    loadData();
  }, [examId, router]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft !== null]);

  const handleBackToExam = () => {
    setIsNavigatingBack(true);
    router.push(`/exam/${examId}/take`);
  };

  const handleGoToQuestion = (questionId: string) => {
    setNavigatingToQuestion(questionId);
    router.push(`/exam/${examId}/take?q=${questionId}`);
  };

  const handleOpenConfirm = () => {
    setIsOpeningConfirm(true);
    // Brief delay to show interaction before modal pops
    setTimeout(() => {
      setShowConfirm(true);
      setIsOpeningConfirm(false);
    }, 150);
  };

  const handleSubmit = async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);

    try {
      await fetch(`/api/exam/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      router.push(`/exam/${examId}/submitted`);
    } catch {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const answerMap = new Map(answers.map((a) => [a.question_id, a]));

  const answered = questions.filter((q) => answerMap.get(q.id)?.selected_option_id);
  const skipped = questions.filter(
    (q) => answerMap.get(q.id)?.is_skipped && !answerMap.get(q.id)?.selected_option_id
  );
  const bookmarked = questions.filter((q) => answerMap.get(q.id)?.is_bookmarked);
  const unanswered = questions.filter(
    (q) => !answerMap.get(q.id)?.selected_option_id && !answerMap.get(q.id)?.is_skipped
  );

  const isUrgent = timeLeft !== null && timeLeft < 300;

  const IconCheck = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
  );
  const IconSkip = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
  );
  const IconBookmark = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
  );
  const IconQuestion = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-lg border-b border-border px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Review & Submit</h1>
          {timeLeft !== null && (
            <div className={`px-4 py-2 rounded-xl font-mono font-bold text-lg ${
              isUrgent ? "bg-danger/10 text-danger animate-timer-urgent" : "bg-primary/10 text-primary"
            }`}>
              {formatTime(timeLeft)}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-slide-up">
          <div className="glass-card p-5 text-center">
            <p className="text-3xl font-bold text-success">{answered.length}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><IconCheck /> Answered</p>
          </div>
          <div className="glass-card p-5 text-center">
            <p className="text-3xl font-bold text-warning">{skipped.length}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><IconSkip /> Skipped</p>
          </div>
          <div className="glass-card p-5 text-center">
            <p className="text-3xl font-bold text-secondary">{bookmarked.length}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><IconBookmark /> Bookmarked</p>
          </div>
          <div className="glass-card p-5 text-center">
            <p className="text-3xl font-bold text-muted">{unanswered.length}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><IconQuestion /> Unanswered</p>
          </div>
        </div>

        {unanswered.length > 0 && (
          <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-warning text-sm mb-6 animate-fade-in flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            You have {unanswered.length} unanswered question{unanswered.length !== 1 ? "s" : ""}. You can go back and answer them before submitting.
          </div>
        )}

        {[
          { title: "Answered", items: answered, color: "success", Icon: IconCheck },
          { title: "Skipped", items: skipped, color: "warning", Icon: IconSkip },
          { title: "Bookmarked", items: bookmarked, color: "secondary", Icon: IconBookmark },
          { title: "Unanswered", items: unanswered, color: "muted", Icon: IconQuestion },
        ]
          .filter(({ items }) => items.length > 0)
          .map(({ title, items, color, Icon }) => (
            <div key={title} className="mb-6">
              <h3 className={`text-sm font-semibold text-${color} mb-3 flex items-center gap-2`}>
                <Icon /> {title} ({items.length})
              </h3>
              <div className="space-y-2">
                {items.map((q) => (
                  <button
                    key={q.id}
                    disabled={navigatingToQuestion !== null || isNavigatingBack || submitting || isOpeningConfirm}
                    onClick={() => handleGoToQuestion(q.id)}
                    className="w-full text-left p-3 rounded-xl bg-card border border-border hover:border-border-hover hover:bg-card-hover transition-all text-sm disabled:opacity-70 flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-2">Q{questions.indexOf(q) + 1}.</span>
                      <span className="text-foreground">
                        {q.question.length > 80 ? q.question.slice(0, 80) + "..." : q.question}
                      </span>
                      <span className="text-xs text-muted ml-2">[{q.topic}]</span>
                    </div>
                    {navigatingToQuestion === q.id && (
                      <div className="spinner" style={{ width: 14, height: 14 }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

        <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
          <button
            onClick={handleBackToExam}
            disabled={isNavigatingBack || submitting || isOpeningConfirm || navigatingToQuestion !== null}
            className="px-6 py-3 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isNavigatingBack ? (
              <div className="spinner" style={{ width: 16, height: 16 }} />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            )}
            Back to Exam
          </button>
          <button
            onClick={handleOpenConfirm}
            disabled={isOpeningConfirm || submitting || isNavigatingBack || navigatingToQuestion !== null}
            className="px-8 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-success to-accent text-white hover:scale-[1.02] active:scale-[0.98] transition-all glow-success flex items-center gap-2 disabled:opacity-50"
          >
            {isOpeningConfirm ? (
              <div className="spinner" style={{ width: 16, height: 16, borderTopColor: 'white' }} />
            ) : (
              <>
                Submit Exam
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </>
            )}
          </button>
        </div>
      </main>

      {/* Tab Switch Warning Modal */}
      {showTabWarning && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card p-8 max-w-md w-full text-center animate-slide-up shadow-2xl border-danger/30">
            <div className="w-20 h-20 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Warning!</h2>
            <p className="text-danger font-semibold mb-4 text-lg">
              What&apos;s up, Seems Like you cheated by tab switching
            </p>
            <p className="text-muted-foreground mb-8 text-sm">
              Your activity has been logged and reported to the administrator. Multiple violations may lead to disqualification.
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

      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="glass-card p-8 max-w-md w-full mx-4 animate-slide-up">
            <h2 className="text-xl font-bold text-foreground mb-2">Submit Exam?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              You have answered {answered.length} of {questions.length} questions. This action cannot be undone.
            </p>
            {unanswered.length > 0 && (
              <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-warning text-xs mb-6 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                {unanswered.length} question{unanswered.length !== 1 ? "s" : ""} will be marked as unanswered.
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-success to-accent text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="spinner" style={{ width: 14, height: 14, borderTopColor: "white", borderColor: "rgba(255,255,255,0.3)" }} />
                    Submitting...
                  </span>
                ) : (
                  "Confirm Submit"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
