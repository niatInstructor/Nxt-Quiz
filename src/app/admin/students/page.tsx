"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";

interface ParticipantInfo {
  status: string;
  exams: {
    title: string;
  };
}

interface Student {
  id: string;
  full_name: string;
  email: string;
  student_college_id: string;
  role: string;
  onboarded_at: string | null;
  created_at: string;
  exam_participants?: ParticipantInfo[];
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Edit State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", student_college_id: "" });
  const [isSaving, setIsSaving] = useState(false);

  const fetchStudents = useCallback(async () => {
    const res = await fetch("/api/admin/students");
    if (res.ok) {
      const data = await res.json();
      setStudents(data.students || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStudents();
  }, [fetchStudents]);

  const handleDeleteAll = async () => {
    const confirmText = prompt('This will PERMANENTLY delete ALL students, their results, and their accounts. This action is IRREVERSIBLE. Type "DELETE ALL" to confirm:');
    if (confirmText !== "DELETE ALL") return;

    setIsDeletingAll(true);
    const res = await fetch("/api/admin/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteAll: true, confirmation: "DELETE ALL STUDENTS" }),
    });
    if (res.ok) {
      setStudents([]);
    }
    setIsDeletingAll(false);
  };

  const handleDelete = async (userId: string, name: string) => {
    if (!confirm(`Permanently delete student "${name}"? This will remove all their exam data, attempts, and account. This cannot be undone.`)) return;
    setDeletingId(userId);
    const res = await fetch("/api/admin/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      setStudents((prev) => prev.filter((s) => s.id !== userId));
    }
    setDeletingId(null);
  };

  const handleEditClick = (student: Student) => {
    setEditingStudent(student);
    setEditForm({
      full_name: student.full_name || "",
      student_college_id: student.student_college_id || "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    
    setIsSaving(true);
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: editingStudent.id,
        full_name: editForm.full_name,
        student_college_id: editForm.student_college_id,
      }),
    });

    if (res.ok) {
      setStudents((prev) =>
        prev.map((s) =>
          s.id === editingStudent.id
            ? { ...s, full_name: editForm.full_name, student_college_id: editForm.student_college_id }
            : s
        )
      );
      setEditingStudent(null);
    } else {
      alert("Failed to update student details.");
    }
    setIsSaving(false);
  };

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (s.full_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.student_college_id || "").toLowerCase().includes(q);

      return matchesSearch;
    });
  }, [students, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="text-sm text-muted-foreground mt-1">{students.length} registered students</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
          {students.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={isDeletingAll}
              className="px-4 py-2 rounded-xl text-xs font-bold text-danger hover:bg-danger/10 border border-danger/20 transition-all flex items-center gap-2"
            >
              {isDeletingAll ? (
                <>
                  <div className="spinner" style={{ width: 12, height: 12 }} />
                  Deleting All...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete All
                </>
              )}
            </button>
          )}
          <div className="relative">
            <svg className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 w-full sm:w-64"
            />
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-muted-foreground font-medium">Name</th>
                <th className="text-left p-4 text-muted-foreground font-medium">College ID</th>
                <th className="text-left p-4 text-muted-foreground font-medium">Email</th>
                <th className="text-left p-4 text-muted-foreground font-medium">Status</th>
                <th className="text-left p-4 text-muted-foreground font-medium">Activity</th>
                <th className="text-right p-4 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const activeExam = s.exam_participants?.find(p => p.status === "active");
                return (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    <td className="p-4 text-foreground font-medium">{s.full_name || "—"}</td>
                    <td className="p-4 font-mono text-accent text-xs">{s.student_college_id || "—"}</td>
                    <td className="p-4 text-muted-foreground text-xs">{s.email || "—"}</td>
                    <td className="p-4">
                      <span className={`text-[10px] px-2 py-1 rounded-lg uppercase font-bold tracking-wider ${s.onboarded_at ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                        {s.onboarded_at ? "Onboarded" : "Pending"}
                      </span>
                    </td>
                    <td className="p-4">
                      {activeExam ? (
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                          </span>
                          <span className="text-[10px] font-bold text-primary truncate max-w-[120px]" title={activeExam.exams.title}>
                            {activeExam.exams.title}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Idle</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditClick(s)}
                          className="px-3 py-1 rounded-lg text-xs font-medium text-warning hover:bg-warning/10 transition-all"
                        >
                          Edit
                        </button>
                        <Link
                          href={`/admin/students/${s.id}`}
                          className="px-3 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-all"
                        >
                          View
                        </Link>
                        {deletingId === s.id ? (
                          <div className="spinner inline-block" style={{ width: 16, height: 16 }} />
                        ) : (
                          <button
                            onClick={() => handleDelete(s.id, s.full_name || s.email)}
                            className="px-3 py-1 rounded-lg text-xs font-medium text-danger hover:bg-danger/10 transition-all"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    {search ? "No students match your search" : "No students registered yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="glass-card p-8 w-full max-w-md animate-slide-up">
            <h2 className="text-xl font-bold text-foreground mb-6">Edit Student Profile</h2>
            
            <div className="mb-6 p-4 rounded-xl bg-background border border-border">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Email (Read Only)</p>
              <p className="text-sm font-mono text-muted">{editingStudent.email}</p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Full Name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={e => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">College ID</label>
                <input
                  type="text"
                  value={editForm.student_college_id}
                  onChange={e => setEditForm(prev => ({ ...prev, student_college_id: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all uppercase font-mono"
                  required
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
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
