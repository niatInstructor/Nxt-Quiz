"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ScoreRecord {
  exam_id: string;
  exam_title: string;
  total_score: number;
  max_score: number;
  submitted_at: string;
}

interface AttemptWithExam {
  exam_id: string;
  total_score: number;
  max_score: number;
  submitted_at: string;
  exams: {
    title: string;
  } | null;
}

export default function MyScores() {
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loadScores = async () => {
      try {
        const res = await fetch("/api/scores");
        if (!res.ok) {
          if (res.status === 401) return router.push("/login");
          return;
        }

        const data = await res.json();
        setUserName(data.userName || "Student");

        if (data.attempts) {
          const formattedScores: ScoreRecord[] = (data.attempts as AttemptWithExam[]).map((a) => ({
            exam_id: a.exam_id,
            exam_title: a.exams?.title || "Unknown Exam",
            total_score: a.total_score || 0,
            max_score: a.max_score || 0,
            submitted_at: a.submitted_at
          }));
          setScores(formattedScores);
        }
      } catch (err) {
        console.error("Failed to load scores:", err);
      } finally {
        setLoading(false);
      }
    };

    loadScores();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex flex-col gap-3 px-4 sm:px-6 py-4 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/exam/join")}
            className="p-2 hover:bg-card-hover rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-lg font-bold gradient-text">My Scores</span>
        </div>
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden sm:inline">{userName}</span>
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            {userName[0]}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-4 sm:p-6 animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-foreground mb-2">Performance History</h1>
          <p className="text-muted-foreground text-sm">Review your results from past examinations.</p>
        </div>

        {scores.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No scores yet</h3>
            <p className="text-muted-foreground mb-6">You haven&apos;t completed any exams yet.</p>
            <button
              onClick={() => router.push("/exam/join")}
              className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-all"
            >
              Join an Exam
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {scores.map((record, idx) => {
              const percentage = record.max_score ? Math.round((record.total_score / record.max_score) * 100) : 0;
              const isExcellent = percentage >= 80;
              const isGood = percentage >= 60;

              return (
                <div 
                  key={`${record.exam_id}-${idx}`}
                  className="glass-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:border-primary/30 transition-all group"
                >
                  <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${
                    isExcellent ? "bg-success/10 text-success" : 
                    isGood ? "bg-warning/10 text-warning" : 
                    "bg-danger/10 text-danger"
                  }`}>
                    <span className="text-lg font-bold">{percentage}%</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground text-lg truncate group-hover:text-primary transition-colors">
                      {record.exam_title}
                    </h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(record.submitted_at).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-6 w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-border">
                    <div className="text-center sm:text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Score</p>
                      <p className="font-mono font-bold text-foreground">
                        {record.total_score} <span className="text-muted-foreground font-normal">/ {record.max_score}</span>
                      </p>
                    </div>
                    <button 
                      onClick={() => router.push(`/exam/${record.exam_id}/submitted`)}
                      className="ml-auto p-2 rounded-lg bg-card-hover hover:bg-border text-muted-foreground transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
