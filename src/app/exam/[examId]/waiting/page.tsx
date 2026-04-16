"use client";

import { createClient } from "@/lib/supabase/browser";
import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";

export default function WaitingRoom({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [examTitle, setExamTitle] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [capacity, setCapacity] = useState(300);
  const router = useRouter();

  const fetchExamData = useCallback(async () => {
    const supabase = createClient();

    // Use API to bypass RLS
    const res = await fetch(`/api/exam/${examId}/status`);
    if (res.ok) {
      const data = await res.json();
      setExamTitle(data.title || "");
      setCapacity(data.capacity || 300);
      setParticipantCount(data.participantCount || 0);

      if (data.status === "in_progress") {
        router.push(`/exam/${examId}/take`);
        return;
      }
      if (data.status === "closed") {
        router.push(`/exam/${examId}/submitted`);
        return;
      }
    }
  }, [examId, router]);

  useEffect(() => {
    fetchExamData();

    const supabase = createClient();

    // Subscribe to exam status changes via Realtime
    const channel = supabase
      .channel(`exam-realtime-${examId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exams",
          filter: `id=eq.${examId}`,
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === "in_progress") {
            router.push(`/exam/${examId}/take`);
          } else if (newStatus === "closed") {
            router.push(`/exam/${examId}/submitted`);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exam_participants",
          filter: `exam_id=eq.${examId}`,
        },
        () => {
          // Refresh participant count
          fetchExamData();
        }
      )
      .subscribe();

    // Also poll every 5s as a fallback in case Realtime isn't configured
    const interval = setInterval(fetchExamData, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [examId, router, fetchExamData]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center animate-slide-up">
        {/* Pulsing icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-secondary mb-8 animate-pulse-glow">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2">Waiting Room</h1>
        {examTitle && (
          <p className="text-lg text-primary font-medium mb-6">{examTitle}</p>
        )}

        {/* Status card */}
        <div className="glass-card p-8 mb-6">
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-accent">{participantCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Students Joined</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-muted-foreground">{capacity}</p>
              <p className="text-xs text-muted-foreground mt-1">Capacity</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-border rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
              style={{ width: `${Math.min((participantCount / capacity) * 100, 100)}%` }}
            />
          </div>

          {/* Waiting animation */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <span className="text-sm">Waiting for the instructor to start the exam</span>
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-primary rounded-full dot-1" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full dot-2" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full dot-3" />
            </span>
          </div>
        </div>

        {/* Tips */}
        <div className="glass-card p-6 text-left">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Before the exam starts:
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Ensure a stable internet connection
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              You have 40 minutes once the exam begins
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              You can bookmark, skip, and revisit questions
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Answers auto-save as you go
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
