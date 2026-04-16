"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isValidStudentId, STUDENT_ID_ERROR, normalizeStudentId } from "@/lib/student-id";

export default function Onboarding() {
  const [collegeId, setCollegeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("");
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUserName(user.user_metadata?.full_name || user.email || "Student");
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = normalizeStudentId(collegeId);

    if (!isValidStudentId(trimmed)) {
      setError(STUDENT_ID_ERROR);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("complete_onboarding", {
      p_student_college_id: trimmed,
    });

    if (rpcError) {
      if (rpcError.message.includes("duplicate") || rpcError.message.includes("unique")) {
        setError("This College ID is already registered by another student");
      } else {
        setError(rpcError.message);
      }
      setLoading(false);
      return;
    }

    router.push("/exam/join");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-success to-accent mb-4 glow-success">
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Welcome, {userName}!
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter your Student College ID to complete registration
          </p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm animate-fade-in">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="college-id"
                className="block text-sm font-medium text-muted-foreground mb-2"
              >
                Student College ID
              </label>
              <input
                id="college-id"
                type="text"
                value={collegeId}
                onChange={(e) => setCollegeId(e.target.value.toUpperCase())}
                placeholder="e.g. CS2024001"
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                required
                autoFocus
                maxLength={11}
              />
              <p className="mt-2 text-xs text-muted">
                This ID uniquely identifies you. It cannot be changed later.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || collegeId.trim().length < 3}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-semibold transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed glow-primary"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner" />
                  Saving...
                </span>
              ) : (
                "Complete Registration"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
