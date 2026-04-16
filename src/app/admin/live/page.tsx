"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Exam {
  id: string;
  exam_code: string;
  title: string;
  status: string;
  capacity: number;
  participant_count: number;
  waiting_count?: number;
  active_count?: number;
  submitted_count?: number;
  duration_seconds: number;
  starts_at: string | null;
}

export default function LiveMonitor() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  const fetchExams = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/exams/live-stats");
      
      if (res.status === 403) {
        router.push("/admin/login");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setExams(data.exams || []);
      }
    } catch (err) {
      console.error("Failed to fetch live stats:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

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
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-warning/5 border border-warning/10 text-center">
                      <p className="text-sm font-bold text-warning">{exam.waiting_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Waiting</p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/5 border border-primary/10 text-center">
                      <p className="text-sm font-bold text-primary">{exam.active_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Active</p>
                    </div>
                    <div className="p-2 rounded-lg bg-success/5 border border-success/10 text-center">
                      <p className="text-sm font-bold text-success">{exam.submitted_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Done</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground font-medium text-[10px] uppercase">Total Enrollment</span>
                      <span className="text-foreground font-bold">{exam.participant_count} / {exam.capacity}</span>
                    </div>
                    <div className="w-full h-1.5 bg-border/50 rounded-full overflow-hidden">
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
                    <span className="text-primary font-bold">
                      Control Exam →
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
