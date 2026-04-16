import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Get all exams that are live or waiting
  const { data: exams, error: examsError } = await supabase
    .from("exams")
    .select("id, exam_code, title, status, capacity, duration_seconds, starts_at")
    .in("status", ["waiting", "in_progress"])
    .order("created_at", { ascending: false });

  if (examsError) {
    return NextResponse.json({ error: examsError.message }, { status: 500 });
  }

  // Efficiently get participant counts grouped by exam and status in one or two queries
  // Since Supabase/PostgREST doesn't support complex GROUP BY in simple select, 
  // we fetch the counts for these specific exams.
  
  const examIds = exams.map(e => e.id);
  
  if (examIds.length === 0) {
    return NextResponse.json({ exams: [] });
  }

  const { data: participants, error: pError } = await supabase
    .from("exam_participants")
    .select("exam_id, status")
    .in("exam_id", examIds);

  if (pError) {
    return NextResponse.json({ error: pError.message }, { status: 500 });
  }

  const statsMap: Record<string, { total: number, waiting: number, active: number, submitted: number }> = {};
  examIds.forEach(id => {
    statsMap[id] = { total: 0, waiting: 0, active: 0, submitted: 0 };
  });

  participants?.forEach(p => {
    const s = statsMap[p.exam_id];
    if (s) {
      s.total++;
      if (p.status === "waiting") s.waiting++;
      else if (p.status === "active") s.active++;
      else if (p.status === "submitted") s.submitted++;
    }
  });

  const enriched = exams.map(e => ({
    ...e,
    participant_count: statsMap[e.id].total,
    waiting_count: statsMap[e.id].waiting,
    active_count: statsMap[e.id].active,
    submitted_count: statsMap[e.id].submitted,
  }));

  return NextResponse.json({ exams: enriched });
}
