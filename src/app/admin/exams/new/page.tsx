"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const VALID_QUESTION_TYPES = ["theory", "code-output", "spot-the-bug", "conceptual", "debugging"];

interface ValidatedQuestion {
  id?: string;
  topic?: string;
  difficulty?: string;
  questionType?: string;
  question: string;
  codeSnippet?: string | null;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation?: string;
  tags?: string[];
}

interface ValidationError {
  index: number;
  errors: string[];
}

function validateQuestions(questions: unknown[]): { valid: boolean; errors: ValidationError[]; parsed: ValidatedQuestion[] } {
  const errors: ValidationError[] = [];
  const parsed: ValidatedQuestion[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Record<string, unknown>;
    const qErrors: string[] = [];

    // Check question text
    if (!q.question || typeof q.question !== "string" || q.question.trim().length === 0) {
      qErrors.push("Missing or empty \"question\" field (required string)");
    }

    // Check options
    if (!q.options) {
      qErrors.push("Missing \"options\" field (required array of 4 option objects)");
    } else if (!Array.isArray(q.options)) {
      qErrors.push("\"options\" must be an array");
    } else {
      if (q.options.length < 2) {
        qErrors.push(`\"options\" must have at least 2 entries, found ${q.options.length}`);
      }
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j] as Record<string, unknown>;
        if (!opt || typeof opt !== "object") {
          qErrors.push(`Option ${j + 1}: must be an object with \"id\" and \"text\"`);
        } else {
          if (!opt.id || typeof opt.id !== "string") {
            qErrors.push(`Option ${j + 1}: missing or invalid \"id\" (expected string like \"A\", \"B\", etc.)`);
          }
          if (!opt.text || typeof opt.text !== "string" || opt.text.trim().length === 0) {
            qErrors.push(`Option ${j + 1}: missing or empty \"text\"`);
          }
        }
      }
    }

    // Check correctOptionId
    const correctId = q.correctOptionId || q.correct_option_id;
    if (!correctId || typeof correctId !== "string") {
      qErrors.push("Missing \"correctOptionId\" field (required string matching one of the option IDs)");
    } else if (Array.isArray(q.options)) {
      const optionIds = q.options.map((o: Record<string, unknown>) => o.id);
      if (!optionIds.includes(correctId)) {
        qErrors.push(`\"correctOptionId\" value \"${correctId}\" does not match any option ID (${optionIds.join(", ")})`);
      }
    }

    // Check questionType (optional but must be valid if provided)
    if (q.questionType && typeof q.questionType === "string" && !VALID_QUESTION_TYPES.includes(q.questionType)) {
      qErrors.push(`Invalid \"questionType\": \"${q.questionType}\". Allowed values: ${VALID_QUESTION_TYPES.join(", ")}`);
    }

    // Check tags (optional but must be array of strings)
    if (q.tags && !Array.isArray(q.tags)) {
      qErrors.push("\"tags\" must be an array of strings if provided");
    }

    if (qErrors.length > 0) {
      errors.push({ index: i, errors: qErrors });
    } else {
      parsed.push(q as unknown as ValidatedQuestion);
    }
  }

  return { valid: errors.length === 0, errors, parsed };
}

export default function CreateExam() {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number | string>("");
  const [capacity, setCapacity] = useState<number | string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [validatedQuestions, setValidatedQuestions] = useState<ValidatedQuestion[] | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [result, setResult] = useState<{ examCode: string; examId: string } | null>(null);
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setJsonFile(file);
    setIsValidated(false);
    setValidatedQuestions(null);
    setValidationErrors([]);
    setError("");

    if (!file) return;

    try {
      const text = await file.text();
      let questions;
      try {
        questions = JSON.parse(text);
        if (!Array.isArray(questions)) questions = [questions];
      } catch {
        setError("Invalid JSON — file could not be parsed. Please check the file is valid JSON.");
        return;
      }

      if (questions.length === 0) {
        setError("JSON file contains no questions. The file must contain at least one question object.");
        return;
      }

      const result = validateQuestions(questions);
      if (result.valid) {
        setValidatedQuestions(result.parsed);
        setIsValidated(true);
        setValidationErrors([]);
      } else {
        setValidationErrors(result.errors);
        setIsValidated(false);
      }
    } catch {
      setError("Could not read the file. Please try again.");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidated || !validatedQuestions) {
      setError("Please upload and validate a questions JSON file first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Create the exam
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

      // 2. Import validated questions for this exam
      const importRes = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: validatedQuestions, examId }),
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
          Create a new exam session. You must upload a valid JSON file of questions. The file will be validated before the exam is created.
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

            {/* JSON Upload + Validation */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>Upload the question JSON file. It will be validated instantly before the exam code is generated.</span>
              </div>
              
              <div className="mt-1">
                <label className={`cursor-pointer flex items-center gap-3 p-3 rounded-lg border-2 border-dashed transition-all ${
                  isValidated ? "border-success/50 bg-success/5 text-success" : validationErrors.length > 0 ? "border-danger/50 bg-danger/5 text-danger" : jsonFile ? "border-warning/50 bg-warning/5 text-warning" : "border-border hover:border-primary/50 bg-background"
                }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isValidated ? "bg-success text-white" : validationErrors.length > 0 ? "bg-danger text-white" : "bg-primary/10 text-primary"
                  }`}>
                    {isValidated ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : validationErrors.length > 0 ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">
                      {isValidated ? `${jsonFile!.name} — Validated` : jsonFile ? jsonFile.name : "Select Questions JSON"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {isValidated
                        ? `${validatedQuestions!.length} questions ready`
                        : validationErrors.length > 0
                          ? `${validationErrors.length} question(s) have errors`
                          : jsonFile
                            ? `${(jsonFile.size / 1024).toFixed(1)} KB — validating...`
                            : "Mandatory file upload"}
                    </p>
                  </div>
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={handleFileChange}
                    className="hidden" 
                  />
                </label>
              </div>
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="rounded-xl border border-danger/20 overflow-hidden">
                <div className="bg-danger/10 px-4 py-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <span className="text-sm font-bold text-danger">
                    Validation Failed — {validationErrors.length} question(s) have issues
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-border">
                  {validationErrors.map((ve) => (
                    <div key={ve.index} className="px-4 py-3 bg-card">
                      <p className="text-xs font-bold text-foreground mb-1.5">
                        Question #{ve.index + 1}
                      </p>
                      <ul className="space-y-1">
                        {ve.errors.map((err, j) => (
                          <li key={j} className="text-[11px] text-danger flex items-start gap-1.5">
                            <span className="text-danger/60 mt-0.5">•</span>
                            <span>{err}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validated Questions Preview */}
            {isValidated && validatedQuestions && (
              <div className="rounded-xl border border-success/20 overflow-hidden">
                <div className="bg-success/10 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-sm font-bold text-success">
                      All {validatedQuestions.length} questions validated
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {(() => {
                      const types = validatedQuestions.reduce((acc, q) => {
                        const t = q.questionType || "theory";
                        acc[t] = (acc[t] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>);
                      return Object.entries(types).map(([type, count]) => (
                        <span key={type} className="px-2 py-0.5 rounded bg-success/10 text-success font-semibold">
                          {type}: {count}
                        </span>
                      ));
                    })()}
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-border">
                  {validatedQuestions.map((q, i) => (
                    <div key={q.id || i} className="px-4 py-2.5 bg-card flex items-center gap-3 hover:bg-card-hover transition-colors">
                      <span className="text-[10px] font-mono text-muted w-6 text-right flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground line-clamp-1">{q.question}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {q.codeSnippet && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold uppercase">Code</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          q.difficulty === "Intermediate" ? "bg-warning/10 text-warning" : q.difficulty === "Advanced" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                        }`}>
                          {q.difficulty || "Basic"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !title.trim() || !isValidated}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner" />
                  Creating...
                </span>
              ) : !isValidated ? (
                "Upload valid JSON to continue"
              ) : (
                `Create Exam with ${validatedQuestions?.length} Questions`
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
