"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  created_at: string;
  questionsCount?: number;
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
  const [deleting, setDeleting] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editForm, setEditForm] = useState<{ title: string; capacity: number | string; durationMinutes: number | string }>({ title: "", capacity: "", durationMinutes: "" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/admin/exams/${examId}`);
      if (res.status === 403) {
        router.push("/admin/login");
        return;
      }
      
      if (!res.ok) {
        throw new Error("Failed to fetch exam data");
      }

      const data = await res.json();
      
      const qRes = await fetch(`/api/admin/exams/${examId}/questions-count`);
      const { count } = qRes.ok ? await qRes.json() : { count: 0 };

      setExam({ ...data.exam, questionsCount: count });
      setParticipants(data.participants || []);
      setEditForm({
        title: data.exam.title,
        capacity: data.exam.capacity,
        durationMinutes: Math.round(data.exam.duration_seconds / 60),
      });
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load exam details. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const questionsToImport = Array.isArray(json) ? json : [json];
      
      const res = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: questionsToImport, examId }),
      });

      if (res.ok) {
        alert("Questions uploaded and linked successfully!");
        fetchData();
      } else {
        const d = await res.json();
        alert("Upload failed: " + (d.error || "Unknown error"));
      }
    } catch {
      alert("Invalid JSON file format.");
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
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

  const handleDeleteExam = async () => {
    if (!confirm("PERMANENTLY DELETE this exam and all student attempts? This cannot be undone.")) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/exams/${examId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/admin");
    } else {
      setDeleting(false);
      alert("Failed to delete exam");
    }
  };

  const handleUpdateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const res = await fetch(`/api/admin/exams/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      await fetchData();
      setIsSaving(false);
      setIsEditModalOpen(false);
    } else {
      setIsSaving(false);
      alert("Failed to update exam");
    }
  };

  const handleKick = async (userId: string, name: string) => {
    if (!confirm(`Kick student "${name}" from the exam?`)) return;
    setActionLoading(userId);
    const res = await fetch(`/api/admin/exams/${examId}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) fetchData();
    setActionLoading(null);
  };

  const handleReset = async (userId: string, name: string) => {
    if (!confirm(`Reset all answers and attempts for "${name}"? They will be able to start over.`)) return;
    setActionLoading(userId);
    const res = await fetch(`/api/admin/exams/${examId}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) fetchData();
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-20">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" style={{ width: 40, height: 40 }} />
          <p className="text-muted-foreground animate-pulse">Loading controls...</p>
        </div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="flex items-center justify-center h-full p-20">
        <div className="glass-card p-8 max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Error Loading Exam</h2>
          <p className="text-sm text-muted-foreground mb-6">{error || "Exam not found"}</p>
          <button 
            onClick={() => fetchData()}
            className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const waitingCount = participants.filter((p) => p.status === "waiting").length;
  const activeCount = participants.filter((p) => p.status === "active").length;
  const submittedCount = participants.filter((p) => p.status === "submitted").length;

  const statusColors: Record<string, string> = {
    draft: "text-muted border-border",
    waiting: "text-warning border-warning/30",
    in_progress: "text-primary border-primary/30",
    closed: "text-success border-success/30",
  };

  const filteredParticipants = participants.filter(
    (p) =>
      (p.profiles?.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.profiles?.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.profiles?.student_college_id || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header & Metrics */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors mr-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <h1 className="text-3xl font-bold text-foreground line-clamp-1 max-w-[400px]" title={exam.title}>{exam.title}</h1>
            <span
              className={`text-xs px-3 py-1 rounded-lg border ${statusColors[exam.status] || "border-border"}`}
            >
              {exam.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-mono ml-10">
            Code: <span className="text-accent font-bold">{exam.exam_code}</span>
          </p>
        </div>
        
        {/* Compact Metrics Bar */}
        <div className="flex flex-wrap items-center gap-3 glass-card px-4 py-2 rounded-2xl w-full md:w-auto">
          {[
            { label: "Waiting", count: waitingCount, color: "text-warning", dot: "bg-warning" },
            { label: "Active", count: activeCount, color: "text-primary", dot: "bg-primary" },
            { label: "Submitted", count: submittedCount, color: "text-success", dot: "bg-success" },
            { label: "Questions", count: exam.questionsCount || 0, color: "text-accent", dot: "bg-accent" },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.dot} ${s.label === "Active" && s.count > 0 ? "animate-pulse" : ""}`}></span>
                <span className="text-sm font-medium text-foreground">{s.label}</span>
                <span className={`text-sm font-bold ${s.color}`}>{s.count}</span>
              </div>
              {i < 3 && <div className="w-px h-6 bg-border mx-1"></div>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Workspace */}
        <div className="flex-1 space-y-6">
          
          {/* Question Upload Section */}
          {exam.status === "waiting" && (
            <div className="glass-card p-6 bg-gradient-to-br from-card to-card-hover border-primary/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-1">Exam Questions</h3>
                  <p className="text-sm text-muted-foreground">
                    {(exam.questionsCount || 0) > 0 
                      ? `${exam.questionsCount} questions are currently loaded for this exam.`
                      : "No questions loaded yet. You must upload a JSON file before starting."}
                  </p>
                </div>
                <label className={`cursor-pointer flex-shrink-0 px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  isImporting ? "bg-muted text-muted-foreground" : "bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20"
                }`}>
                  {isImporting ? (
                    <>
                      <div className="spinner" style={{ width: 14, height: 14, borderTopColor: "white" }} />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      {exam.questionsCount && exam.questionsCount > 0 ? "Replace JSON" : "Upload JSON"}
                    </>
                  )}
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={isImporting} />
                </label>
              </div>
              {(exam.questionsCount || 0) === 0 && waitingCount > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-2 text-warning text-xs">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <span>Students are waiting, but you cannot start until questions are uploaded.</span>
                </div>
              )}
            </div>
          )}

          {/* Participants Area */}
          <div className="glass-card overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-border gap-4">
              <h3 className="text-sm font-semibold text-foreground flex-shrink-0">
                Students ({participants.length})
              </h3>
              
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/5">
                    <th className="text-left p-4 text-muted-foreground font-medium whitespace-nowrap">Name</th>
                    <th className="text-left p-4 text-muted-foreground font-medium whitespace-nowrap">College ID</th>
                    <th className="text-left p-4 text-muted-foreground font-medium whitespace-nowrap">Email</th>
                    <th className="text-left p-4 text-muted-foreground font-medium whitespace-nowrap">Status</th>
                    <th className="text-left p-4 text-muted-foreground font-medium whitespace-nowrap">Joined At</th>
                    <th className="text-right p-4 text-muted-foreground font-medium whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                      <td className="p-4 text-foreground whitespace-nowrap">{p.profiles?.full_name || "—"}</td>
                      <td className="p-4 font-mono text-accent whitespace-nowrap">{p.profiles?.student_college_id || "—"}</td>
                      <td className="p-4 text-muted-foreground whitespace-nowrap max-w-[200px] truncate" title={p.profiles?.email}>{p.profiles?.email || "—"}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wider font-bold ${
                          p.status === "waiting" ? "bg-warning/10 text-warning"
                            : p.status === "active" ? "bg-primary/10 text-primary"
                            : p.status === "submitted" ? "bg-success/10 text-success"
                            : p.status === "kicked" ? "bg-danger/10 text-danger"
                            : "bg-muted/10 text-muted"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground text-[11px] whitespace-nowrap">{new Date(p.joined_at).toLocaleString()}</td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {actionLoading === p.user_id ? (
                            <div className="spinner" style={{ width: 14, height: 14 }} />
                          ) : (
                            <>
                              {p.status !== "submitted" && p.status !== "kicked" && (
                                <button
                                  onClick={() => handleKick(p.user_id, p.profiles?.full_name || "Student")}
                                  className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-danger hover:bg-danger/10 transition-all"
                                  title="Kick from exam"
                                >
                                  Kick
                                </button>
                              )}
                              <button
                                onClick={() => handleReset(p.user_id, p.profiles?.full_name || "Student")}
                                className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-accent hover:bg-accent/10 transition-all"
                                title="Reset attempt"
                              >
                                Reset
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {participants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-3">
                          <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        </div>
                        <p className="text-muted-foreground text-sm font-medium">No students have joined yet</p>
                      </td>
                    </tr>
                  ) : filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                        No students match your search query.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-80 space-y-6">
          
          {/* Quick Actions */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Quick Actions
            </h3>
            
            <div className="space-y-4">
              {exam.status === "waiting" && (
                <button
                  onClick={handleStart}
                  disabled={starting || waitingCount === 0 || (exam.questionsCount || 0) === 0}
                  className="w-full px-4 py-3.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-success to-accent text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-success/20"
                >
                  {starting ? (
                    <div className="spinner" style={{ width: 16, height: 16, borderTopColor: "white", borderColor: "rgba(255,255,255,0.3)" }} />
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Start Exam Now
                    </>
                  )}
                </button>
              )}

              {exam.status === "in_progress" && (
                <button
                  onClick={handleEnd}
                  disabled={ending}
                  className="w-full px-4 py-3.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-danger to-warning text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-danger/20"
                >
                  {ending ? (
                    <div className="spinner" style={{ width: 16, height: 16, borderTopColor: "white", borderColor: "rgba(255,255,255,0.3)" }} />
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
                      End Exam Early
                    </>
                  )}
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                {(exam.status === "closed" || exam.status === "in_progress") && (
                  <Link
                    href={`/admin/exams/${examId}/analytics`}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-card border border-border text-foreground hover:bg-card-hover transition-colors group text-center gap-1.5"
                  >
                    <svg className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    <span className="text-[11px] font-semibold">Analytics</span>
                  </Link>
                )}
                
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl bg-card border border-border text-foreground hover:bg-card-hover transition-colors group text-center gap-1.5 ${
                    (exam.status === "closed" || exam.status === "in_progress") ? "col-span-1" : "col-span-2"
                  }`}
                >
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:scale-110 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                  <span className="text-[11px] font-semibold">Settings</span>
                </button>

                <button
                  onClick={handleDeleteExam}
                  disabled={deleting}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border border-border transition-colors group text-center gap-1.5 ${
                    (exam.status === "closed" || exam.status === "in_progress") ? "col-span-2" : "col-span-2 mt-1"
                  } bg-card hover:bg-danger/10`}
                >
                  <svg className="w-5 h-5 text-danger group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  <span className="text-[11px] font-semibold text-danger">{deleting ? "Deleting..." : "Delete Exam"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Exam Details Box */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Exam Details
            </h3>
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-semibold text-foreground capitalize">{exam.status.replace("_", " ")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-semibold text-foreground">{Math.round(exam.duration_seconds / 60)} minutes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Capacity</span>
                <span className="font-semibold text-foreground">{exam.capacity ? `${exam.capacity} slots` : "Unlimited"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-semibold text-foreground">{exam.created_at ? new Date(exam.created_at).toLocaleDateString() : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="glass-card p-8 w-full max-w-md animate-slide-up">
            <h2 className="text-xl font-bold text-foreground mb-6">Edit Exam Settings</h2>
            <form onSubmit={handleUpdateExam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Duration (min)</label>
                  <input
                    type="number"
                    value={editForm.durationMinutes}
                    onChange={e => setEditForm(prev => ({ ...prev, durationMinutes: e.target.value === "" ? "" : parseInt(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Capacity</label>
                  <input
                    type="number"
                    value={editForm.capacity}
                    onChange={e => setEditForm(prev => ({ ...prev, capacity: e.target.value === "" ? "" : parseInt(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="spinner" style={{ width: 14, height: 14, borderTopColor: "white", borderColor: "rgba(255,255,255,0.3)" }} />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
