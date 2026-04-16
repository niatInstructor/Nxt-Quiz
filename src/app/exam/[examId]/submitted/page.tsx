"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const percentage = maxScore ? Math.round((score || 0) / maxScore * 100) : 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center animate-slide-up">
        {/* Success icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-success to-accent mb-8 glow-success">
          <svg
            className="w-10 h-10 text-white"
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
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2">
          Exam Completed!
        </h1>
        <p className="text-muted-foreground mb-8">
          {examTitle || "Your assessment"} has been submitted successfully.
        </p>

        <div className="glass-card p-8 mb-8">
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Your Score</p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-black gradient-text">{score ?? 0}</span>
              <span className="text-xl text-muted-foreground font-medium">/ {maxScore ?? 0}</span>
            </div>
          </div>

          <div className="w-full bg-muted/30 h-3 rounded-full overflow-hidden mb-6">
            <div 
              className="h-full bg-gradient-to-r from-success to-accent transition-all duration-1000 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-xl bg-card border border-border">
              <p className="text-muted-foreground text-xs mb-1">Percentage</p>
              <p className="text-foreground font-bold text-lg">{percentage}%</p>
            </div>
            <div className="p-3 rounded-xl bg-card border border-border">
              <p className="text-muted-foreground text-xs mb-1">Status</p>
              <p className="text-success font-bold text-lg">Passed</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-border/50 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">Submitted on:</span>{" "}
              {submittedAt || "Processing..."}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push("/exam/join")}
            className="w-full px-6 py-4 rounded-2xl text-sm font-bold bg-foreground text-background hover:opacity-90 transition-all shadow-lg"
          >
            Back to Exams
          </button>
          
          <button
            onClick={() => {
              const supabase = createClient();
              supabase.auth.signOut().then(() => router.push("/login"));
            }}
            className="w-full px-6 py-4 rounded-2xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
