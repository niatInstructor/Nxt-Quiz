"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Exam {
  id: string;
  exam_code: string;
  title: string;
  status: string;
  capacity: number;
  participant_count: number;
  duration_seconds: number;
  starts_at: string | null;
}

export default function LiveMonitor() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExams = useCallback(async () => {
    const res = await fetch("/api/admin/exams");
    if (res.ok) {
      const data = await res.json();
      const live = (data.exams || []).filter(
        (e: Exam) => e.status === "in_progress" || e.status === "waiting"
      );
      setExams(live);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchExams();
    const interval = setInterval(fetchExams, 5000);
    return () => clearInterval(interval);
  }, [fetchExams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Exam Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time status of all active and waiting exams
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-xs font-bold animate-pulse">
          <span className="w-2 h-2 rounded-full bg-success" />
          LIVE UPDATING
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-muted-foreground">No exams are currently live or waiting</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => {
            const progress = Math.min((exam.participant_count / exam.capacity) * 100, 100);
            
            return (
              <Link
                key={exam.id}
                href={`/admin/exams/${exam.id}`}
                className="glass-card p-6 hover:border-primary/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {exam.title}
                    </h3>
                    <p className="text-xs font-mono text-accent font-bold mt-1">
                      {exam.exam_code}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-lg border font-bold uppercase tracking-wider ${
                    exam.status === 'in_progress' 
                      ? 'bg-primary/10 text-primary border-primary/20' 
                      : 'bg-warning/10 text-warning border-warning/20'
                  }`}>
                    {exam.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Capacity</span>
                      <span className="text-foreground font-bold">{exam.participant_count} / {exam.capacity}</span>
                    </div>
                    <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${
                          exam.status === 'in_progress' ? 'bg-primary' : 'bg-warning'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {Math.round(exam.duration_seconds / 60)} min
                    </div>
                    <span className="text-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                      Open Controls →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
