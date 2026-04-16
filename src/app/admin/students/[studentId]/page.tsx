"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

interface StudentData {
  student: {
    id: string;
    full_name: string;
    email: string;
    student_college_id: string;
    onboarded_at: string;
    created_at: string;
  };
  attempts: any[];
}

export default function StudentDetails({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchStudent = async () => {
      const res = await fetch(`/api/admin/students/${studentId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
      setLoading(false);
    };
    fetchStudent();
  }, [studentId]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const attempt = data.attempts.find(a => a.id === selectedAttempt) || data.attempts[0];

  return (
    <div className="p-8">
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Back to Students
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Profile & Attempts List */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-2xl font-bold">
                {data.student.full_name?.[0] || "S"}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{data.student.full_name || "Unknown"}</h1>
                <p className="text-sm text-muted-foreground font-mono">{data.student.student_college_id}</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="text-foreground">{data.student.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Joined:</span>
                <span className="text-foreground">{new Date(data.student.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="text-success font-medium">Active</span>
              </div>
            </div>
          </div>

          {/* Exam History */}
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-border bg-card/50">
              <h3 className="font-semibold text-foreground">Exam History</h3>
            </div>
            <div className="divide-y divide-border/50">
              {data.attempts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAttempt(a.id)}
                  className={`w-full p-4 text-left transition-all hover:bg-card-hover ${selectedAttempt === a.id || (!selectedAttempt && a.id === data.attempts[0]?.id) ? 'bg-primary/5 border-l-4 border-primary' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-foreground line-clamp-1">{a.exams?.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === 'submitted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>{new Date(a.created_at).toLocaleDateString()}</span>
                    {a.status === 'submitted' && (
                      <span className="font-bold text-foreground">{a.total_score} / {a.max_score}</span>
                    )}
                  </div>
                </button>
              ))}
              {data.attempts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No exam attempts yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Attempt Breakdown */}
        <div className="lg:col-span-2">
          {attempt && attempt.status === 'submitted' && attempt.answers ? (
            <div className="glass-card">
              <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10 rounded-t-2xl">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Submission Review</h2>
                  <p className="text-sm text-muted-foreground">{attempt.exams?.title} • {attempt.exams?.exam_code}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-primary">{attempt.total_score} / {attempt.max_score}</div>
                  <p className="text-xs text-muted-foreground">Total Points</p>
                </div>
              </div>

              <div className="p-6 space-y-8">
                {attempt.answers.map((ans: any, idx: number) => {
                  const isCorrect = ans.selected_option_id === ans.questions.correct_option_id;
                  const opts = typeof ans.questions.options === 'string' ? JSON.parse(ans.questions.options) : ans.questions.options;
                  
                  return (
                    <div key={ans.id} className="relative pl-8">
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
                      <div className={`absolute left-[-4px] top-1.5 w-2 h-2 rounded-full ${isCorrect ? 'bg-success' : ans.selected_option_id ? 'bg-danger' : 'bg-muted'}`} />
                      
                      <div className="mb-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Question {idx + 1}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-border/50 text-muted-foreground">{ans.questions.topic}</span>
                        </div>
                        <h4 className="text-foreground font-medium leading-relaxed">{ans.questions.question}</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {opts.map((opt: any) => {
                          const isSelected = ans.selected_option_id === opt.id;
                          const isCorrectOpt = ans.questions.correct_option_id === opt.id;
                          
                          let borderColor = 'border-border';
                          let bgColor = 'bg-card';
                          let textColor = 'text-foreground';

                          if (isCorrectOpt) {
                            borderColor = 'border-success';
                            bgColor = 'bg-success/5';
                          } else if (isSelected && !isCorrectOpt) {
                            borderColor = 'border-danger';
                            bgColor = 'bg-danger/5';
                          }

                          return (
                            <div
                              key={opt.id}
                              className={`p-3 rounded-xl border-2 text-sm flex gap-3 ${borderColor} ${bgColor} ${textColor}`}
                            >
                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${isCorrectOpt ? 'bg-success text-white' : isSelected ? 'bg-danger text-white' : 'bg-border/50 text-muted-foreground'}`}>
                                {opt.id}
                              </span>
                              <span className="pt-0.5">{opt.text}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs">
                        <p className="font-bold text-primary mb-1 uppercase tracking-widest">Explanation</p>
                        <p className="text-muted-foreground leading-relaxed">{ans.questions.explanation}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : attempt ? (
            <div className="glass-card p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Attempt in Progress</h3>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                This student is currently taking the exam or hasn't submitted yet. Detailed answers will be available once the attempt is closed.
              </p>
            </div>
          ) : (
            <div className="glass-card p-12 text-center text-muted-foreground">
              Select an exam attempt to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
