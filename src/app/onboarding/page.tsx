"use client";

import { FloatingThemeToggle } from "@/components/FloatingThemeToggle";
import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isValidStudentId, STUDENT_ID_ERROR, STUDENT_ID_EXAMPLE, normalizeStudentId, STUDENT_ID_PREFIX } from "@/lib/student-id";

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
        // If in local dev, don't redirect to login, use a dummy name
        if (process.env.NEXT_PUBLIC_ENVIRONMENT === "local") {
          setUserName("Local Student");
          return;
        }
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
    
    // In local dev, we might not have a user session. 
    // We'll try to get the user ID, or fallback to a dummy ID if it's local.
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = user?.id;

    let rpcError;

    if (!targetUserId && (process.env.NEXT_PUBLIC_ENVIRONMENT === "local")) {
      // Use API route to bypass RLS in local dev
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentCollegeId: trimmed,
          fullName: userName
        })
      });
      if (!res.ok) {
        const data = await res.json();
        rpcError = { message: data.error || "Failed to complete onboarding" };
      }
    } else {
      const { error } = await supabase.rpc("complete_onboarding", {
        p_student_college_id: trimmed,
      });
      rpcError = error;
    }

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
      <FloatingThemeToggle />
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
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 font-mono text-lg select-none">
                  {STUDENT_ID_PREFIX}
                </span>
                <input
                  id="college-id"
                  type="text"
                  value={collegeId}
                  onChange={(e) => setCollegeId(e.target.value.toUpperCase())}
                  placeholder={STUDENT_ID_EXAMPLE}
                  className="w-full pl-24 pr-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-mono text-lg"
                  required
                  autoFocus
                  maxLength={5}
                />
              </div>
              <p className="mt-3 text-xs text-muted flex items-start gap-2">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                This ID uniquely identifies you. The prefix <strong>{STUDENT_ID_PREFIX}</strong> is already added.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || collegeId.trim().length < 1}
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
