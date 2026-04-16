"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Exam {
  id: string;
  exam_code: string;
  title: string;
  status: string;
  capacity: number;
  duration_seconds: number;
  created_at: string;
  participant_count?: number;
}

export default function AdminDashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExams = async () => {
      const res = await fetch("/api/admin/exams");
      if (res.ok) {
        const data = await res.json();
        setExams(data.exams || []);
      }
      setLoading(false);
    };
    fetchExams();
  }, []);

  const statusColors: Record<string, string> = {
    draft: "text-muted bg-muted/10 border-muted/20",
    waiting: "text-warning bg-warning/10 border-warning/20",
    in_progress: "text-primary bg-primary/10 border-primary/20",
    closed: "text-success bg-success/10 border-success/20",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const grouped = {
    in_progress: exams.filter((e) => e.status === "in_progress"),
    waiting: exams.filter((e) => e.status === "waiting"),
    draft: exams.filter((e) => e.status === "draft"),
    closed: exams.filter((e) => e.status === "closed"),
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exam Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and monitor all exams
          </p>
        </div>
        <Link
          href="/admin/exams/new"
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          + Create Exam
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active", count: grouped.in_progress.length, color: "primary" },
          { label: "Waiting", count: grouped.waiting.length, color: "warning" },
          { label: "Draft", count: grouped.draft.length, color: "muted" },
          { label: "Closed", count: grouped.closed.length, color: "success" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-5">
            <p className={`text-3xl font-bold text-${s.color}`}>{s.count}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Exam list */}
      {exams.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground mb-4">No exams created yet</p>
          <Link
            href="/admin/exams/new"
            className="text-primary hover:text-primary-hover text-sm"
          >
            Create your first exam →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Link
              key={exam.id}
              href={`/admin/exams/${exam.id}`}
              className="block glass-card p-5 hover:border-border-hover transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-accent font-bold">
                    {exam.exam_code}
                  </span>
                  <span className="text-foreground font-medium">
                    {exam.title}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-lg border ${
                      statusColors[exam.status] || ""
                    }`}
                  >
                    {exam.status.replace("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <span>{exam.participant_count || 0} students</span>
                  <span>{Math.round(exam.duration_seconds / 60)} min</span>
                  <svg
                    className="w-4 h-4 text-muted group-hover:text-primary transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
