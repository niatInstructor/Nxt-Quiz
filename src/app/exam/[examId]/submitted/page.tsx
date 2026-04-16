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
        .select("submitted_at, status")
        .eq("exam_id", examId)
        .eq("user_id", user.id)
        .single();

      if (attempt?.submitted_at) {
        setSubmittedAt(new Date(attempt.submitted_at).toLocaleString());
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
          Exam Submitted!
        </h1>
        <p className="text-muted-foreground mb-8">
          Your answers have been recorded successfully.
        </p>

        <div className="glass-card p-6 mb-8">
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">
              <span className="text-foreground font-medium">Submitted at:</span>{" "}
              {submittedAt || "Processing..."}
            </p>
            <p className="text-xs mt-4 text-muted">
              Your exam has been locked. Results will be shared by your
              instructor.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            const supabase = createClient();
            supabase.auth.signOut().then(() => router.push("/login"));
          }}
          className="px-6 py-3 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
