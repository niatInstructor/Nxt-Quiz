"use client";

import { useState, useEffect, use } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface AnalyticsData {
  examTitle: string;
  summary: {
    totalParticipants: number;
    totalSubmitted: number;
    avgScore: number;
    medianScore: number;
    highestScore: number;
    lowestScore: number;
    completionRate: number;
    maxPossible: number;
  };
  topicPerformance: { topic: string; avgCorrectPct: number; count: number }[];
  questionMetrics: {
    question_id: string;
    topic: string;
    difficulty: string;
    correct_percentage: number;
    submitted_attempts: number;
    correct_count: number;
    skipped_count: number;
  }[];
  scoreDistribution: { range: string; count: number }[];
  studentResults: {
    name: string;
    email: string;
    college_id: string;
    score: number;
    max_score: number;
    submitted_at: string;
  }[];
}

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

export default function Analytics({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const exportCSV = () => {
    if (!data) return;
    const headers = "Name,Email,College ID,Score,Max Score,Submitted At\n";
    const rows = data.studentResults
      .map(
        (s) =>
          `"${s.name}","${s.email}","${s.college_id}",${s.score},${s.max_score},"${s.submitted_at}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exam-results-${examId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const filteredStudents = data.studentResults.filter(
    (s) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.college_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.examTitle}
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="px-5 py-2.5 rounded-xl text-sm font-medium bg-card border border-border text-foreground hover:bg-card-hover transition-all"
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Avg Score",
            value: `${data.summary.avgScore.toFixed(1)}/${data.summary.maxPossible}`,
            color: "primary",
          },
          {
            label: "Median Score",
            value: `${data.summary.medianScore.toFixed(1)}`,
            color: "secondary",
          },
          {
            label: "Highest",
            value: `${data.summary.highestScore}`,
            color: "success",
          },
          {
            label: "Lowest",
            value: `${data.summary.lowestScore}`,
            color: "danger",
          },
          {
            label: "Total Submitted",
            value: `${data.summary.totalSubmitted}`,
            color: "accent",
          },
          {
            label: "Completion Rate",
            value: `${data.summary.completionRate.toFixed(0)}%`,
            color: "warning",
          },
          {
            label: "Total Registered",
            value: `${data.summary.totalParticipants}`,
            color: "foreground",
          },
          {
            label: "Max Possible",
            value: `${data.summary.maxPossible}`,
            color: "muted",
          },
        ].map((s) => (
          <div key={s.label} className="glass-card p-5 text-center">
            <p className={`text-2xl font-bold text-${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Topic performance */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Topic-wise Performance
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.topicPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="topic"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                angle={-30}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: "#12121a",
                  border: "1px solid #1e1e2e",
                  borderRadius: "12px",
                  color: "#e8e8ed",
                }}
              />
              <Bar
                dataKey="avgCorrectPct"
                name="Avg Correct %"
                radius={[6, 6, 0, 0]}
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

        {/* Score distribution */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Score Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="range"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
              />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#12121a",
                  border: "1px solid #1e1e2e",
                  borderRadius: "12px",
                  color: "#e8e8ed",
                }}
              />
              <Bar
                dataKey="count"
                name="Students"
                fill="#6366f1"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Question difficulty table */}
      <div className="glass-card mb-8 overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Question Difficulty Metrics
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Q#
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Topic
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Difficulty
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Correct %
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Correct
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Skipped
                </th>
              </tr>
            </thead>
            <tbody>
              {data.questionMetrics.map((q, i) => (
                <tr
                  key={q.question_id}
                  className="border-b border-border/50 hover:bg-card-hover transition-colors"
                >
                  <td className="p-4 font-mono text-muted">{i + 1}</td>
                  <td className="p-4 text-foreground">{q.topic}</td>
                  <td className="p-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-lg ${
                        q.difficulty === "Intermediate"
                          ? "bg-warning/10 text-warning"
                          : "bg-success/10 text-success"
                      }`}
                    >
                      {q.difficulty}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            q.correct_percentage >= 70
                              ? "bg-success"
                              : q.correct_percentage >= 40
                              ? "bg-warning"
                              : "bg-danger"
                          }`}
                          style={{ width: `${q.correct_percentage || 0}%` }}
                        />
                      </div>
                      <span className="text-foreground">
                        {q.correct_percentage?.toFixed(0) || 0}%
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-success">{q.correct_count}</td>
                  <td className="p-4 text-warning">{q.skipped_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student results */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Student Results ({data.studentResults.length})
          </h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or ID..."
            className="px-4 py-2 rounded-xl bg-background border border-border text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-primary transition-all w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-muted-foreground font-medium">
                  #
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Name
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  College ID
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Score
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  %
                </th>
                <th className="text-left p-4 text-muted-foreground font-medium">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-card-hover transition-colors"
                >
                  <td className="p-4 text-muted">{i + 1}</td>
                  <td className="p-4 text-foreground">{s.name || "—"}</td>
                  <td className="p-4 font-mono text-accent">
                    {s.college_id || "—"}
                  </td>
                  <td className="p-4 text-foreground font-semibold">
                    {s.score}/{s.max_score}
                  </td>
                  <td className="p-4">
                    <span
                      className={
                        s.max_score > 0 &&
                        (s.score / s.max_score) * 100 >= 70
                          ? "text-success"
                          : (s.score / s.max_score) * 100 >= 40
                          ? "text-warning"
                          : "text-danger"
                      }
                    >
                      {s.max_score > 0
                        ? ((s.score / s.max_score) * 100).toFixed(0)
                        : 0}
                      %
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground text-xs">
                    {s.submitted_at
                      ? new Date(s.submitted_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
