"use client";

import { useState, useEffect, useCallback } from "react";

interface Option {
  id: string;
  text: string;
}

interface Question {
  id: string;
  topic: string;
  difficulty: string;
  question: string;
  options: Option[];
  correct_option_id: string;
  explanation: string;
  tags: string[];
}

export default function QuestionBank() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const [form, setForm] = useState<Partial<Question>>({
    topic: "React",
    difficulty: "Basic",
    question: "",
    options: [
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ],
    correct_option_id: "A",
    explanation: "",
    tags: [],
  });

  const fetchQuestions = useCallback(async () => {
    const res = await fetch("/api/admin/questions");
    if (res.ok) {
      const data = await res.json();
      setQuestions(data.questions || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const url = editingId ? `/api/admin/questions/${editingId}` : "/api/admin/questions";
    const method = editingId ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        await fetchQuestions();
        setEditingId(null);
        setShowAdd(false);
        setForm({
          topic: "React",
          difficulty: "Basic",
          question: "",
          options: [
            { id: "A", text: "" },
            { id: "B", text: "" },
            { id: "C", text: "" },
            { id: "D", text: "" },
          ],
          correct_option_id: "A",
          explanation: "",
          tags: [],
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This will remove the question from all exams.")) return;
    const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
    if (res.ok) fetchQuestions();
  };

  const handleDeleteAll = async () => {
    const confirmText = prompt('This will PERMANENTLY delete ALL questions from the bank and remove them from all exams. Type "DELETE ALL" to confirm:');
    if (confirmText !== "DELETE ALL") return;

    setIsDeletingAll(true);
    const res = await fetch("/api/admin/questions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteAll: true }),
    });
    if (res.ok) {
      setQuestions([]);
    }
    setIsDeletingAll(false);
  };

  const handleEdit = (q: Question) => {
    setForm({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    });
    setEditingId(q.id);
    setShowAdd(true);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const questionsToImport = Array.isArray(json) ? json : [json];
      
      const res = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: questionsToImport }),
      });

      if (res.ok) {
        alert("Import successful!");
        fetchQuestions();
      } else {
        alert("Import failed.");
      }
    } catch {
      alert("Invalid JSON file.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const filtered = questions.filter(q =>
    q.question.toLowerCase().includes(search.toLowerCase()) ||
    q.topic.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
          <p className="text-sm text-muted-foreground mt-1">{questions.length} questions available</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search questions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-4 py-2 rounded-xl bg-background border border-border text-sm w-48 focus:outline-none focus:border-primary"
          />
          {questions.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={isDeletingAll}
              className="px-4 py-2 rounded-xl text-xs font-bold text-danger hover:bg-danger/10 border border-danger/20 transition-all flex items-center gap-2"
            >
              {isDeletingAll ? (
                <>
                  <div className="spinner" style={{ width: 12, height: 12 }} />
                  Deleting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete All
                </>
              )}
            </button>
          )}
          <label className="cursor-pointer px-4 py-2 rounded-xl text-xs font-semibold bg-card border border-border text-foreground hover:bg-card-hover transition-all flex items-center gap-2">
            {importing ? (
              <>
                <div className="spinner" style={{ width: 12, height: 12 }} />
                Importing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Import JSON
              </>
            )}
            <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={importing} />
          </label>
          <button
            onClick={() => {
              setEditingId(null);
              setShowAdd(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            + Add Question
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-card/50">
              <tr className="border-b border-border">
                <th className="p-4 text-muted-foreground font-medium w-1/2">Question</th>
                <th className="p-4 text-muted-foreground font-medium">Topic</th>
                <th className="p-4 text-muted-foreground font-medium">Difficulty</th>
                <th className="p-4 text-muted-foreground font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                  <td className="p-4">
                    <p className="text-foreground font-medium line-clamp-1">{q.question}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{q.id}</p>
                  </td>
                  <td className="p-4">
                    <span className="text-xs px-2 py-1 rounded-lg bg-border/50 text-muted-foreground">{q.topic}</span>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-lg ${q.difficulty === 'Intermediate' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                      {q.difficulty}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(q)}
                        className="p-2 text-muted-foreground hover:text-primary transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(q.id)}
                        className="p-2 text-muted-foreground hover:text-danger transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="glass-card p-8 w-full max-w-2xl my-8 animate-slide-up">
            <h2 className="text-xl font-bold text-foreground mb-6">
              {editingId ? "Edit Question" : "Add New Question"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Topic</label>
                  <input
                    type="text"
                    value={form.topic}
                    onChange={e => setForm(prev => ({ ...prev, topic: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={e => setForm(prev => ({ ...prev, difficulty: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Intermediate">Intermediate</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Question Text</label>
                <textarea
                  value={form.question}
                  onChange={e => setForm(prev => ({ ...prev, question: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all min-h-[100px]"
                  required
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Options</label>
                {(form.options || []).map((opt: Option, idx: number) => (
                  <div key={opt.id} className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${form.correct_option_id === opt.id ? 'bg-success text-white' : 'bg-border text-muted-foreground'}`}>
                      {opt.id}
                    </span>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={e => {
                        const newOpts = [...(form.options || [])];
                        newOpts[idx].text = e.target.value;
                        setForm(prev => ({ ...prev, options: newOpts }));
                      }}
                      className="flex-1 px-4 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all text-sm"
                      placeholder={`Option ${opt.id}...`}
                      required
                    />
                    <input
                      type="radio"
                      name="correct"
                      checked={form.correct_option_id === opt.id}
                      onChange={() => setForm(prev => ({ ...prev, correct_option_id: opt.id }))}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Explanation</label>
                <textarea
                  value={form.explanation}
                  onChange={e => setForm(prev => ({ ...prev, explanation: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary transition-all min-h-[80px]"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="spinner" style={{ width: 14, height: 14, borderTopColor: "white", borderColor: "rgba(255,255,255,0.3)" }} />
                      {editingId ? "Saving..." : "Creating..."}
                    </>
                  ) : (
                    editingId ? "Save Changes" : "Create Question"
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
