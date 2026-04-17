"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateExam() {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number | string>("");
  const [capacity, setCapacity] = useState<number | string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ examCode: string; examId: string } | null>(
    null
  );
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonFile) {
      setError("Please select a JSON questions file");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Read the JSON file first to ensure it's valid
      const text = await jsonFile.text();
      let questions;
      try {
        questions = JSON.parse(text);
        if (!Array.isArray(questions)) questions = [questions];
      } catch {
        setError("Invalid JSON file format");
        setLoading(false);
        return;
      }

      // 2. Create the exam
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          durationMinutes: Number(duration),
          capacity: Number(capacity),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create exam");
        setLoading(false);
        return;
      }

      const examId = data.examId;

      // 3. Import questions for this specific exam
      const importRes = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, examId }),
      });

      if (!importRes.ok) {
        const importData = await importRes.json();
        setError("Exam created, but question upload failed: " + (importData.error || "Unknown error"));
        setLoading(false);
        return;
      }

      setResult({ examCode: data.examCode, examId: data.examId });
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Network error occurred during creation");
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="p-8 flex items-center justify-center min-h-full">
        <div className="w-full max-w-md text-center animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-success to-accent mb-6 glow-success">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Exam Created!
          </h1>
          <p className="text-muted-foreground text-sm mb-6">
            Share this code with your students
          </p>

          <div className="glass-card p-8 mb-6">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
              Exam Code
            </p>
            <p className="text-4xl font-mono font-bold text-accent tracking-widest">
              {result.examCode}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() =>
                navigator.clipboard.writeText(result.examCode)
              }
              className="flex-1 py-3 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
            >
              <span className="flex items-center justify-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>Copy Code</span>
            </button>
            <button
              onClick={() =>
                router.push(`/admin/exams/${result.examId}`)
              }
              className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] transition-all"
            >
              Go to Control Panel →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Create New Exam
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Create a new exam session. You must upload a specific JSON file of questions to be used exclusively for this exam. Students will receive these questions in a randomized order.
        </p>

        <div className="glass-card p-8">
          <form onSubmit={handleCreate} className="space-y-6">
            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="exam-title"
                className="block text-sm font-medium text-muted-foreground mb-2"
              >
                Exam Title
              </label>
              <input
                id="exam-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Section A - Final Quiz"
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="duration"
                  className="block text-sm font-medium text-muted-foreground mb-2"
                >
                  Duration (minutes)
                </label>
                <input
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value === "" ? "" : Number(e.target.value))}
                  min={5}
                  max={180}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="capacity"
                  className="block text-sm font-medium text-muted-foreground mb-2"
                >
                  Capacity
                </label>
                <input
                  id="capacity"
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                  min={1}
                  max={1000}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                  required
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>Upload the question JSON file. Each student receives questions in a different random order.</span>
              </div>
              
              <div className="mt-1">
                <label className={`cursor-pointer flex items-center gap-3 p-3 rounded-lg border-2 border-dashed transition-all ${
                  jsonFile ? "border-success/50 bg-success/5 text-success" : "border-border hover:border-primary/50 bg-background"
                }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${jsonFile ? "bg-success text-white" : "bg-primary/10 text-primary"}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">
                      {jsonFile ? jsonFile.name : "Select Questions JSON"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {jsonFile ? `${(jsonFile.size / 1024).toFixed(1)} KB` : "Mandatory file upload"}
                    </p>
                  </div>
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={(e) => setJsonFile(e.target.files?.[0] || null)}
                    className="hidden" 
                    required 
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !title.trim() || !jsonFile}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner" />
                  Creating...
                </span>
              ) : (
                "Create Exam"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
