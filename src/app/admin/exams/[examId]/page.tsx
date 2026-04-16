"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

interface Participant {
  id: string;
  user_id: string;
  status: string;
  joined_at: string;
  profiles: {
    full_name: string;
    email: string;
    student_college_id: string;
  };
}

interface ExamData {
  id: string;
  exam_code: string;
  title: string;
  status: string;
  capacity: number;
  duration_seconds: number;
  starts_at: string | null;
  closes_at: string | null;
}

export default function ExamControl({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const router = useRouter();

  const fetchData = async () => {
    const res = await fetch(`/api/admin/exams/${examId}`);
    if (res.ok) {
      const data = await res.json();
      setExam(data.exam);
      setParticipants(data.participants || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const handleStart = async () => {
    if (!confirm("Start the exam for all waiting students? This cannot be undone."))
      return;
    setStarting(true);
    const res = await fetch(`/api/exam/${examId}/start`, { method: "POST" });
    if (res.ok) fetchData();
    setStarting(false);
  };

  const handleEnd = async () => {
    if (
      !confirm(
        "End the exam now? All active attempts will be auto-submitted with their current answers. This cannot be undone."
      )
    )
      return;
    setEnding(true);
    const res = await fetch(`/api/exam/${examId}/end`, { method: "POST" });
    if (res.ok) fetchData();
    setEnding(false);
  };

  if (loading || !exam) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const waitingCount = participants.filter((p) => p.status === "waiting").length;
  const activeCount = participants.filter((p) => p.status === "active").length;
  const submittedCount = participants.filter((p) => p.status === "submitted").length;

  const statusColors: Record<string, string> = {
    draft: "text-muted",
    waiting: "text-warning",
    in_progress: "text-primary",
    closed: "text-success",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">{exam.title}</h1>
            <span
              className={`text-xs px-3 py-1 rounded-lg border border-current/20 ${statusColors[exam.status]}`}
            >
              {exam.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Code: <span className="text-accent font-bold">{exam.exam_code}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {exam.status === "waiting" && (
            <button
              onClick={handleStart}
              disabled={starting || waitingCount === 0}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-success to-accent text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 glow-success flex items-center gap-2"
            >
              {starting ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14, borderTopColor: "white", borderColor: "rgba(255,255,255,0.3)" }} />
                  Starting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Start Exam ({waitingCount} students)
                </>
              )}
            </button>
          )}
          {exam.status === "in_progress" && (
            <button
              onClick={handleEnd}
              disabled={ending}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-danger to-warning text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {ending ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14, borderTopColor: "white", borderColor: "rgba(255,255,255,0.3)" }} />
                  Ending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
                  End Exam Now
                </>
              )}
            </button>
          )}
          {(exam.status === "closed" || exam.status === "in_progress") && (
            <a
              href={`/admin/exams/${examId}/analytics`}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              View Analytics
            </a>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="glass-card p-5 text-center">
          <p className="text-3xl font-bold text-warning">{waitingCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Waiting</p>
        </div>
        <div className="glass-card p-5 text-center">
          <p className="text-3xl font-bold text-primary">{activeCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Taking Exam</p>
        </div>
        <div className="glass-card p-5 text-center">
          <p className="text-3xl font-bold text-success">{submittedCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Submitted</p>
        </div>
        <div className="glass-card p-5 text-center">
          <p className="text-3xl font-bold text-foreground">{participants.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total / {exam.capacity}</p>
        </div>
      </div>

      {/* Participants table */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Students ({participants.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-muted-foreground font-medium">Name</th>
                <th className="text-left p-4 text-muted-foreground font-medium">College ID</th>
                <th className="text-left p-4 text-muted-foreground font-medium">Email</th>
                <th className="text-left p-4 text-muted-foreground font-medium">Status</th>
                <th className="text-left p-4 text-muted-foreground font-medium">Joined At</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                  <td className="p-4 text-foreground">{p.profiles?.full_name || "—"}</td>
                  <td className="p-4 font-mono text-accent">{p.profiles?.student_college_id || "—"}</td>
                  <td className="p-4 text-muted-foreground">{p.profiles?.email || "—"}</td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-lg ${
                      p.status === "waiting" ? "bg-warning/10 text-warning"
                        : p.status === "active" ? "bg-primary/10 text-primary"
                        : p.status === "submitted" ? "bg-success/10 text-success"
                        : "bg-muted/10 text-muted"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground text-xs">{new Date(p.joined_at).toLocaleString()}</td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No students have joined yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
