"use client";

import { useState, useEffect, use, useMemo, Fragment } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

/* ──────────────────────────── TYPES ──────────────────────────── */

interface ExamMeta {
  id: string;
  title: string;
  examCode: string;
  status: string;
  durationSeconds: number;
  capacity: number;
  startsAt: string | null;
  closesAt: string | null;
  createdAt: string;
}

interface Summary {
  totalParticipants: number;
  totalSubmitted: number;
  avgScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  completionRate: number;
  maxPossible: number;
  passRate: number;
  totalQuestions: number;
}

interface OptionBreakdown {
  A: number;
  B: number;
  C: number;
  D: number;
}

interface DetailedQuestion {
  position: number;
  points: number;
  questionId: string;
  questionText: string;
  codeSnippet: string | null;
  topic: string;
  difficulty: string;
  questionType: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  tags: string[];
  correctPercentage: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  bookmarkedCount: number;
  submittedAttempts: number;
  optionBreakdown: OptionBreakdown;
}

interface StudentResult {
  name: string;
  email: string;
  college_id: string;
  score: number;
  max_score: number;
  percentage: number;
  grade: string;
  timeToSubmitSeconds: number | null;
  submitted_at: string | null;
  tab_switch_count: number;
}

interface TimeAnalytics {
  avgTimeSeconds: number;
  fastestTimeSeconds: number | null;
  slowestTimeSeconds: number | null;
  earlySubmissions: number;
  onTimeSubmissions: number;
  lateSubmissions: number;
  examDurationSeconds: number;
}

interface ExamHealth {
  hardestQuestion: {
    position: number;
    text: string;
    correctPct: number;
  } | null;
  easiestQuestion: {
    position: number;
    text: string;
    correctPct: number;
  } | null;
  mostSkipped: { position: number; text: string; count: number } | null;
  mostBookmarked: { position: number; text: string; count: number } | null;
}

interface AnalyticsData {
  examMeta: ExamMeta;
  summary: Summary;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  topicPerformance: {
    topic: string;
    avgCorrectPct: number;
    questionCount: number;
    totalAttempts: number;
  }[];
  scoreDistribution: { range: string; count: number }[];
  difficultyBreakdown: {
    difficulty: string;
    avgCorrectPct: number;
    questionCount: number;
  }[];
  detailedQuestions: DetailedQuestion[];
  studentResults: StudentResult[];
  timeAnalytics: TimeAnalytics;
  examHealth: ExamHealth;
}

/* ──────────────────────────── HELPERS ──────────────────────────── */

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

const GRADE_COLORS: Record<string, string> = {
  A: "#10b981",
  B: "#06b6d4",
  C: "#f59e0b",
  D: "#f97316",
  F: "#ef4444",
};

function formatTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function pctColor(pct: number): string {
  if (pct >= 70) return "text-success";
  if (pct >= 40) return "text-warning";
  return "text-danger";
}

function pctBg(pct: number): string {
  if (pct >= 70) return "bg-success";
  if (pct >= 40) return "bg-warning";
  return "bg-danger";
}

function gradeBadge(grade: string): string {
  const map: Record<string, string> = {
    A: "bg-success/10 text-success border-success/20",
    B: "bg-[#06b6d4]/10 text-[#06b6d4] border-[#06b6d4]/20",
    C: "bg-warning/10 text-warning border-warning/20",
    D: "bg-[#f97316]/10 text-[#f97316] border-[#f97316]/20",
    F: "bg-danger/10 text-danger border-danger/20",
  };
  return map[grade] || "";
}

/* ──────────────────────────── COMPONENT ──────────────────────────── */

export default function Analytics({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSort, setStudentSort] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({ key: "score", dir: "desc" });
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [questionSort, setQuestionSort] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({ key: "position", dir: "asc" });
  const [activeTab, setActiveTab] = useState<
    "overview" | "questions" | "students" | "time"
  >("overview");

  useEffect(() => {
    const fetchAnalytics = async () => {
      const res = await fetch(`/api/admin/exams/${examId}/analytics`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
      setLoading(false);
    };
    fetchAnalytics();
  }, [examId]);

  /* – Derived data – */

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const q = studentSearch.toLowerCase();
    const filtered = data.studentResults.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.college_id?.toLowerCase().includes(q),
    );
    return [...filtered].sort((a, b) => {
      const key = studentSort.key as keyof StudentResult;
      const aVal = a[key] ?? 0;
      const bVal = b[key] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return studentSort.dir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return studentSort.dir === "asc"
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });
  }, [data, studentSearch, studentSort]);

  const sortedQuestions = useMemo(() => {
    if (!data) return [];
    return [...data.detailedQuestions].sort((a, b) => {
      const key = questionSort.key as keyof DetailedQuestion;
      const aVal = a[key] ?? 0;
      const bVal = b[key] ?? 0;
      return questionSort.dir === "asc"
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });
  }, [data, questionSort]);

  const gradeChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.gradeDistribution).map(([grade, count]) => ({
      name: `Grade ${grade}`,
      value: count,
      grade,
    }));
  }, [data]);

  /* – CSV Export – */

  const exportCSV = () => {
    if (!data) return;
    const headers =
      "Rank,Name,Email,College ID,Score,Max Score,Percentage,Grade,Time to Submit,Submitted At\n";
    const rows = data.studentResults
      .map(
        (s, i) =>
          `${i + 1},"${s.name}","${s.email}","${s.college_id}",${s.score},${s.max_score},${s.percentage}%,${s.grade},"${formatTime(s.timeToSubmitSeconds)}","${s.submitted_at || "—"}"`,
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = data.examMeta.title.replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `${safeTitle}-${data.examMeta.examCode}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!data) return;

    // Define type for jsPDF with autoTable extension
    interface AutoTableDoc extends jsPDF {
      lastAutoTable?: { finalY: number };
    }

    const doc = new jsPDF() as AutoTableDoc;
    const { examMeta, summary, studentResults } = data;

    // Header
    doc.setFontSize(20);
    doc.text("Examination Report", 14, 22);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`${examMeta.title} (${examMeta.examCode})`, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);

    // Summary Section
    doc.setDrawColor(200);
    doc.line(14, 42, 196, 42);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Summary Statistics", 14, 50);
    
    autoTable(doc, {
      startY: 55,
      head: [["Metric", "Value"]],
      body: [
        ["Total Participants", summary.totalParticipants.toString()],
        ["Total Submissions", summary.totalSubmitted.toString()],
        ["Average Score", `${summary.avgScore} / ${summary.maxPossible}`],
        ["Pass Rate", `${summary.passRate}%`],
        ["Completion Rate", `${summary.completionRate}%`],
      ],
      theme: "striped",
      headStyles: { fillColor: [79, 70, 229] },
    });

    // Student Results Table
    const finalY1 = doc.lastAutoTable?.finalY ?? 100;
    doc.setFontSize(14);
    doc.text("Student Results", 14, finalY1 + 15);

    const tableData = studentResults.map((s, i) => [
      (i + 1).toString(),
      s.name,
      s.college_id,
      `${s.score}/${s.max_score}`,
      `${s.percentage}%`,
      s.grade,
      s.tab_switch_count.toString(),
      formatTime(s.timeToSubmitSeconds),
    ]);

    autoTable(doc, {
      startY: finalY1 + 20,
      head: [["Rank", "Name", "ID", "Score", "%", "Grade", "Switches", "Time"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8 },
      columnStyles: {
        6: { fontStyle: 'bold', textColor: [220, 38, 38] } // Red for switches
      }
    });

    const safeTitle = examMeta.title.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`${safeTitle}-${examMeta.examCode}-report.pdf`);
  };

  /* – Column sort handler – */
  const toggleStudentSort = (key: string) => {
    setStudentSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  const toggleQuestionSort = (key: string) => {
    setQuestionSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  const SortIcon = ({
    active,
    dir,
  }: {
    active: boolean;
    dir: "asc" | "desc";
  }) => (
    <svg
      className={`inline w-3 h-3 ml-1 ${active ? "text-primary" : "text-muted"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {dir === "asc" ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      )}
    </svg>
  );

  /* ──────────────────────────── RENDER ──────────────────────────── */

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div
            className="spinner mx-auto mb-4"
            style={{ width: 40, height: 40 }}
          />
          <p className="text-muted-foreground text-sm animate-pulse">
            Loading analytics...
          </p>
        </div>
      </div>
    );
  }

  const { examMeta, summary, timeAnalytics, examHealth } = data;

  const statusColors: Record<string, string> = {
    draft: "bg-muted/10 text-muted border-muted/20",
    waiting: "bg-warning/10 text-warning border-warning/20",
    in_progress: "bg-primary/10 text-primary border-primary/20",
    closed: "bg-success/10 text-success border-success/20",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* ═══════════════════════ SECTION 1: EXAM HEADER ═══════════════════════ */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <a
              href={`/admin/exams/${examId}`}
              className="text-xs text-muted-foreground hover:text-primary transition-colors mb-2 inline-flex items-center gap-1"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Control Panel
            </a>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              {examMeta.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="font-mono text-sm text-accent font-bold">
                {examMeta.examCode}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold uppercase tracking-wider ${statusColors[examMeta.status] || ""}`}
              >
                {examMeta.status.replace("_", " ")}
              </span>
              <span className="text-xs text-muted-foreground">
                {Math.round(examMeta.durationSeconds / 60)} min •{" "}
                {summary.totalQuestions} questions • Cap {examMeta.capacity}
              </span>
            </div>
            {/* Timeline */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3 text-[11px] text-muted-foreground">
              <span>
                Created: {new Date(examMeta.createdAt).toLocaleDateString()}
              </span>
              {examMeta.startsAt && (
                <span>
                  Started: {new Date(examMeta.startsAt).toLocaleString()}
                </span>
              )}
              {examMeta.closesAt && (
                <span>
                  Closed: {new Date(examMeta.closesAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={exportCSV}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              CSV
            </button>
            <button
              onClick={exportPDF}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-hover transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              PDF Report
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-6 p-1 bg-card border border-border rounded-xl w-full sm:w-fit overflow-x-auto hide-scrollbar">
          {(["overview", "questions", "students", "time"] as const).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                  activeTab === tab
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card-hover"
                }`}
              >
                {tab === "overview"
                  ? "Overview"
                  : tab === "questions"
                    ? "Questions"
                    : tab === "students"
                      ? "Student Results"
                      : "Time Analysis"}
              </button>
            ),
          )}
        </div>
      </div>

      {/* ═══════════════════════ TAB: OVERVIEW ═══════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-8 animate-fade-in">
          {/* Compact Metrics Bar */}
          <div className="flex flex-wrap items-center justify-between gap-y-4 gap-x-6 glass-card px-6 py-4 rounded-2xl w-full">
            {[
              { label: "Avg Score", value: `${summary.avgScore}/${summary.maxPossible}`, color: "text-primary", sub: `${summary.maxPossible > 0 ? Math.round((summary.avgScore / summary.maxPossible) * 100) : 0}%` },
              { label: "High Score", value: `${summary.highestScore}`, color: "text-success", sub: `${summary.maxPossible > 0 ? Math.round((summary.highestScore / summary.maxPossible) * 100) : 0}%` },
              { label: "Avg Switches", value: `${(data.studentResults.reduce((acc, s) => acc + s.tab_switch_count, 0) / Math.max(1, data.studentResults.length)).toFixed(1)}`, color: "text-danger", sub: "per student" },
              { label: "Pass Rate", value: `${summary.passRate}%`, color: "text-accent", sub: `≥40% to pass` },
              { label: "Submitted", value: `${summary.totalSubmitted}`, color: "text-success", sub: `of ${summary.totalParticipants}` },
              { label: "Completion", value: `${summary.completionRate}%`, color: "text-warning", sub: "submitted/joined" },
              { label: "Avg Time", value: formatTime(timeAnalytics.avgTimeSeconds), color: "text-primary", sub: `of ${Math.round(examMeta.durationSeconds / 60)}m` },
            ].map((s, i, arr) => (
              <div key={s.label} className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{s.label}</span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</span>
                    <span className="text-[10px] text-muted-foreground font-medium">{s.sub}</span>
                  </div>
                </div>
                {i < arr.length - 1 && <div className="hidden lg:block w-px h-8 bg-border/60" />}
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Score Distribution
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="range"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                      color: "#111827",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]}>
                    {data.scoreDistribution.map((entry, i) => {
                      const bucket = i;
                      const color =
                        bucket < 4
                          ? "#ef4444"
                          : bucket < 7
                            ? "#f59e0b"
                            : "#10b981";
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Grade Distribution Pie */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Grade Distribution
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={gradeChartData.filter((g) => g.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {gradeChartData
                      .filter((g) => g.value > 0)
                      .map((entry) => (
                        <Cell
                          key={entry.grade}
                          fill={GRADE_COLORS[entry.grade] || "#9ca3af"}
                        />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
                <span>A ≥90%</span>
                <span>B ≥70%</span>
                <span>C ≥50%</span>
                <span>D ≥40%</span>
                <span>F &lt;40%</span>
              </div>
            </div>
          </div>

          {/* Topic Performance */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Topic-wise Performance
            </h3>
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, data.topicPerformance.length * 50)}
            >
              <BarChart data={data.topicPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  unit="%"
                />
                <YAxis
                  dataKey="topic"
                  type="category"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    fontSize: 12,
                  }}
                  formatter={(
                    value,
                    _name,
                    props,
                  ) => {
                    const p = props as unknown as { payload: { questionCount: number } };
                    return [
                      `${value}% (${p.payload.questionCount} Qs)`,
                      "Avg Correct",
                    ];
                  }}
                />
                <Bar
                  dataKey="avgCorrectPct"
                  name="Avg Correct %"
                  radius={[0, 6, 6, 0]}
                  barSize={24}
                >
                  {data.topicPerformance.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Difficulty Breakdown + Exam Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Difficulty */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Difficulty Breakdown
              </h3>
              <div className="space-y-4">
                {data.difficultyBreakdown.map((d) => (
                  <div
                    key={d.difficulty}
                    className="p-4 rounded-xl bg-background border border-border"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-lg font-bold ${d.difficulty === "Intermediate" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}
                      >
                        {d.difficulty}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {d.questionCount} questions
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pctBg(d.avgCorrectPct)}`}
                          style={{ width: `${d.avgCorrectPct}%` }}
                        />
                      </div>
                      <span
                        className={`text-sm font-bold ${pctColor(d.avgCorrectPct)}`}
                      >
                        {d.avgCorrectPct}%
                      </span>
                    </div>
                  </div>
                ))}
                {data.difficultyBreakdown.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No data available
                  </p>
                )}
              </div>
            </div>

            {/* Exam Health */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Exam Health Insights
              </h3>
              <div className="space-y-3">
                {[
                  {
                    label: "Hardest Question",
                    data: examHealth.hardestQuestion,
                    detail: examHealth.hardestQuestion
                      ? `Q${examHealth.hardestQuestion.position} — ${examHealth.hardestQuestion.correctPct}% correct`
                      : "—",
                    sub: examHealth.hardestQuestion?.text,
                  },
                  {
                    label: "Easiest Question",
                    data: examHealth.easiestQuestion,
                    detail: examHealth.easiestQuestion
                      ? `Q${examHealth.easiestQuestion.position} — ${examHealth.easiestQuestion.correctPct}% correct`
                      : "—",
                    sub: examHealth.easiestQuestion?.text,
                  },
                  {
                    label: "Most Skipped",
                    data: examHealth.mostSkipped,
                    detail: examHealth.mostSkipped
                      ? `Q${examHealth.mostSkipped.position} — ${examHealth.mostSkipped.count} skips`
                      : "—",
                    sub: examHealth.mostSkipped?.text,
                  },
                  {
                    label: "Most Bookmarked",
                    data: examHealth.mostBookmarked,
                    detail: examHealth.mostBookmarked
                      ? `Q${examHealth.mostBookmarked.position} — ${examHealth.mostBookmarked.count} bookmarks`
                      : "—",
                    sub: examHealth.mostBookmarked?.text,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded-xl bg-background border border-border hover:border-border-hover transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                            {item.label}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {item.detail}
                          </span>
                        </div>
                        {item.sub && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {item.sub}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB: QUESTIONS ═══════════════════════ */}
      {activeTab === "questions" && (
        <div className="space-y-6 animate-fade-in">
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Question-by-Question Analysis ({data.detailedQuestions.length})
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Click a row to expand details
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-card/50">
                    {[
                      { key: "position", label: "#", w: "w-12" },
                      { key: "questionText", label: "Question", w: "w-1/3" },
                      { key: "topic", label: "Topic", w: "" },
                      { key: "difficulty", label: "Difficulty", w: "" },
                      { key: "correctPercentage", label: "Correct %", w: "" },
                      { key: "correctCount", label: "Correct", w: "" },
                      { key: "wrongCount", label: "Wrong", w: "" },
                      { key: "skippedCount", label: "Skipped", w: "" },
                      { key: "bookmarkedCount", label: "Bookmarked", w: "" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={`text-left p-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors ${col.w}`}
                        onClick={() => toggleQuestionSort(col.key)}
                      >
                        {col.label}
                        <SortIcon
                          active={questionSort.key === col.key}
                          dir={questionSort.dir}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedQuestions.map((q) => (
                    <Fragment key={q.questionId}>
                      <tr
                        key={q.questionId}
                        className={`border-b border-border/50 hover:bg-card-hover transition-colors cursor-pointer ${
                          q.correctPercentage >= 70
                            ? "border-l-2 border-l-success"
                            : q.correctPercentage >= 40
                              ? "border-l-2 border-l-warning"
                              : "border-l-2 border-l-danger"
                        }`}
                        onClick={() =>
                          setExpandedQ(
                            expandedQ === q.questionId ? null : q.questionId,
                          )
                        }
                      >
                        <td className="p-3 font-mono text-muted text-xs">
                          {q.position}
                        </td>
                        <td className="p-3">
                          <p className="text-foreground line-clamp-1 text-xs">
                            {q.questionText}
                          </p>
                          {q.codeSnippet && (
                            <span className="text-[10px] text-accent ml-1 font-semibold uppercase tracking-widest border border-accent/20 px-1 py-0.5 rounded-sm bg-accent/5">
                              [Code]
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-border/50 text-muted-foreground">
                            {q.topic}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-lg ${q.difficulty === "Intermediate" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}
                          >
                            {q.difficulty}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pctBg(q.correctPercentage)}`}
                                style={{ width: `${q.correctPercentage}%` }}
                              />
                            </div>
                            <span
                              className={`text-xs font-bold ${pctColor(q.correctPercentage)}`}
                            >
                              {q.correctPercentage}%
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-success text-xs font-semibold">
                          {q.correctCount}
                        </td>
                        <td className="p-3 text-danger text-xs font-semibold">
                          {q.wrongCount}
                        </td>
                        <td className="p-3 text-warning text-xs font-semibold">
                          {q.skippedCount}
                        </td>
                        <td className="p-3 text-secondary text-xs font-semibold">
                          {q.bookmarkedCount}
                        </td>
                      </tr>
                      {/* Expanded Row */}
                      {expandedQ === q.questionId && (
                        <tr
                          key={`${q.questionId}-exp`}
                          className="bg-card-hover/50"
                        >
                          <td colSpan={9} className="p-5">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Question Details */}
                              <div>
                                <p className="text-xs font-bold text-foreground mb-2">
                                  Full Question
                                </p>
                                <p className="text-sm text-foreground bg-background p-3 rounded-xl border border-border">
                                  {q.questionText}
                                </p>
                                {q.codeSnippet && (
                                  <pre className="code-block mt-2 text-xs">
                                    {q.codeSnippet}
                                  </pre>
                                )}
                                <div className="mt-3 space-y-1.5">
                                  {Array.isArray(q.options) &&
                                    q.options.map(
                                      (opt: { id: string; text: string }) => (
                                        <div
                                          key={opt.id}
                                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                                            opt.id === q.correctOptionId
                                              ? "bg-success/10 border border-success/20 text-success font-semibold"
                                              : "bg-background border border-border text-foreground"
                                          }`}
                                        >
                                          <span
                                            className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
                                              opt.id === q.correctOptionId
                                                ? "bg-success text-white"
                                                : "bg-border text-muted-foreground"
                                            }`}
                                          >
                                            {opt.id}
                                          </span>
                                          <span className="flex-1">
                                            {opt.text}
                                          </span>
                                          {opt.id === q.correctOptionId && (
                                            <span className="text-[10px]">
                                              ✓ Correct
                                            </span>
                                          )}
                                        </div>
                                      ),
                                    )}
                                </div>
                                {q.explanation && (
                                  <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
                                    <span className="font-bold text-primary">
                                      Explanation:
                                    </span>{" "}
                                    {q.explanation}
                                  </div>
                                )}
                              </div>
                              {/* Option Breakdown */}
                              <div>
                                <p className="text-xs font-bold text-foreground mb-2">
                                  Response Distribution
                                </p>
                                <div className="space-y-2">
                                  {(["A", "B", "C", "D"] as const).map(
                                    (optId) => {
                                      const count = q.optionBreakdown[optId];
                                      const total =
                                        q.optionBreakdown.A +
                                        q.optionBreakdown.B +
                                        q.optionBreakdown.C +
                                        q.optionBreakdown.D;
                                      const pct =
                                        total > 0
                                          ? Math.round((count / total) * 100)
                                          : 0;
                                      const isCorrect =
                                        optId === q.correctOptionId;
                                      return (
                                        <div
                                          key={optId}
                                          className="flex items-center gap-3"
                                        >
                                          <span
                                            className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${isCorrect ? "bg-success text-white" : "bg-border text-muted-foreground"}`}
                                          >
                                            {optId}
                                          </span>
                                          <div className="flex-1">
                                            <div className="w-full h-5 bg-border/50 rounded-md overflow-hidden relative">
                                              <div
                                                className={`h-full rounded-md transition-all ${isCorrect ? "bg-success/60" : "bg-danger/30"}`}
                                                style={{ width: `${pct}%` }}
                                              />
                                              <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-foreground">
                                                {count} ({pct}%)
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                                  <div className="p-2 rounded-lg bg-background border border-border text-center">
                                    <span className="font-bold text-foreground">
                                      {q.submittedAttempts}
                                    </span>
                                    <p className="text-muted-foreground">
                                      Total Responses
                                    </p>
                                  </div>
                                  <div className="p-2 rounded-lg bg-background border border-border text-center">
                                    <span className="font-bold text-foreground">
                                      {q.points} pt{q.points !== 1 ? "s" : ""}
                                    </span>
                                    <p className="text-muted-foreground">
                                      Point Value
                                    </p>
                                  </div>
                                </div>
                                {q.tags.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-1">
                                    {q.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/10"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB: STUDENTS ═══════════════════════ */}
      {activeTab === "students" && (
        <div className="space-y-6 animate-fade-in">
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                Student Leaderboard ({data.studentResults.length} submitted)
              </h3>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search name, email, or ID..."
                  className="px-4 py-2 rounded-xl bg-background border border-border text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-primary transition-all w-full sm:w-64"
                />
                <button
                  onClick={exportCSV}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
                >
                  CSV ↓
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-card/50">
                    {[
                      { key: "rank", label: "Rank" },
                      { key: "name", label: "Name" },
                      { key: "college_id", label: "College ID" },
                      { key: "email", label: "Email" },
                      { key: "score", label: "Score" },
                      { key: "percentage", label: "%" },
                      { key: "grade", label: "Grade" },
                      { key: "tab_switch_count", label: "Switches" },
                      { key: "timeToSubmitSeconds", label: "Time Taken" },
                      { key: "submitted_at", label: "Submitted" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className="text-left p-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors text-xs"
                        onClick={() =>
                          col.key !== "rank" && toggleStudentSort(col.key)
                        }
                      >
                        {col.label}
                        {col.key !== "rank" && (
                          <SortIcon
                            active={studentSort.key === col.key}
                            dir={studentSort.dir}
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-card-hover transition-colors"
                    >
                      <td className="p-3">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                            i === 0
                              ? "bg-warning/10 text-warning"
                              : i === 1
                                ? "bg-border text-muted-foreground"
                                : i === 2
                                  ? "bg-[#cd7f32]/10 text-[#cd7f32]"
                                  : "text-muted"
                          }`}
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="p-3 text-foreground font-medium text-xs">
                        {s.name}
                      </td>
                      <td className="p-3 font-mono text-accent text-[11px]">
                        {s.college_id}
                      </td>
                      <td className="p-3 text-muted-foreground text-[11px]">
                        {s.email}
                      </td>
                      <td className="p-3 text-foreground font-bold text-xs">
                        {s.score}/{s.max_score}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-xs font-bold ${pctColor(s.percentage)}`}
                        >
                          {s.percentage}%
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold ${gradeBadge(s.grade)}`}
                        >
                          {s.grade}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-bold ${s.tab_switch_count > 0 ? "text-danger" : "text-muted"}`}>
                          {s.tab_switch_count}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-[11px] font-mono">
                        {formatTime(s.timeToSubmitSeconds)}
                      </td>
                      <td className="p-3 text-muted-foreground text-[11px]">
                        {s.submitted_at
                          ? new Date(s.submitted_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-8 text-center text-muted-foreground"
                      >
                        {studentSearch
                          ? "No students match your search"
                          : "No submissions yet"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB: TIME ANALYSIS ═══════════════════════ */}
      {activeTab === "time" && (
        <div className="space-y-6 animate-fade-in">
          {/* Time KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              {
                label: "Exam Duration",
                value: formatTime(timeAnalytics.examDurationSeconds),
                color: "foreground",
              },
              {
                label: "Avg Time",
                value: formatTime(timeAnalytics.avgTimeSeconds),
                color: "primary",
              },
              {
                label: "Fastest",
                value: formatTime(timeAnalytics.fastestTimeSeconds),
                color: "success",
              },
              {
                label: "Slowest",
                value: formatTime(timeAnalytics.slowestTimeSeconds),
                color: "danger",
              },
              {
                label: "Early (<50%)",
                value: `${timeAnalytics.earlySubmissions}`,
                color: "accent",
              },
              {
                label: "Late (>90%)",
                value: `${timeAnalytics.lateSubmissions}`,
                color: "warning",
              },
            ].map((s) => (
              <div key={s.label} className="glass-card p-4 text-center">
                <p className={`text-lg font-bold text-${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-semibold">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Time Distribution */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Submission Timing Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-success/5 border border-success/10 text-center">
                <p className="text-3xl font-bold text-success">
                  {timeAnalytics.earlySubmissions}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-semibold uppercase">
                  Early Finishers
                </p>
                <p className="text-[10px] text-muted mt-0.5">
                  Under 50% of allowed time
                </p>
              </div>
              <div className="p-5 rounded-xl bg-primary/5 border border-primary/10 text-center">
                <p className="text-3xl font-bold text-primary">
                  {timeAnalytics.onTimeSubmissions}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-semibold uppercase">
                  Standard
                </p>
                <p className="text-[10px] text-muted mt-0.5">
                  50% – 90% of allowed time
                </p>
              </div>
              <div className="p-5 rounded-xl bg-warning/5 border border-warning/10 text-center">
                <p className="text-3xl font-bold text-warning">
                  {timeAnalytics.lateSubmissions}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-semibold uppercase">
                  Last Minute
                </p>
                <p className="text-[10px] text-muted mt-0.5">
                  Over 90% of allowed time
                </p>
              </div>
            </div>
          </div>

          {/* Fastest & slowest students */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Fastest Submitters (Top 5)
              </h3>
              <div className="space-y-2">
                {data.studentResults
                  .filter((s) => s.timeToSubmitSeconds !== null)
                  .sort(
                    (a, b) =>
                      (a.timeToSubmitSeconds || Infinity) -
                      (b.timeToSubmitSeconds || Infinity),
                  )
                  .slice(0, 5)
                  .map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl bg-background border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-success text-white" : "bg-border text-muted-foreground"}`}
                        >
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {s.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {s.college_id}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold font-mono text-success">
                          {formatTime(s.timeToSubmitSeconds)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.score}/{s.max_score} ({s.percentage}%)
                        </p>
                      </div>
                    </div>
                  ))}
                {data.studentResults.filter(
                  (s) => s.timeToSubmitSeconds !== null,
                ).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No time data available
                  </p>
                )}
              </div>
            </div>
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Slowest Submitters (Top 5)
              </h3>
              <div className="space-y-2">
                {data.studentResults
                  .filter((s) => s.timeToSubmitSeconds !== null)
                  .sort(
                    (a, b) =>
                      (b.timeToSubmitSeconds || 0) -
                      (a.timeToSubmitSeconds || 0),
                  )
                  .slice(0, 5)
                  .map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl bg-background border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-danger text-white" : "bg-border text-muted-foreground"}`}
                        >
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {s.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {s.college_id}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold font-mono text-danger">
                          {formatTime(s.timeToSubmitSeconds)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.score}/{s.max_score} ({s.percentage}%)
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
