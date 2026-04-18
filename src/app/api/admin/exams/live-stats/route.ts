import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
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
    .select("exam_id, user_id, status")
    .in("exam_id", examIds);

  if (pError) {
    return NextResponse.json({ error: pError.message }, { status: 500 });
  }

  // Fetch all attempts for these exams to aggregate tab_switch_count
  const { data: attempts } = await supabase
    .from("attempts")
    .select("exam_id, tab_switch_count")
    .in("exam_id", examIds);

  const statsMap: Record<string, { total: number, waiting: number, active: number, submitted: number, total_tab_switches: number }> = {};
  examIds.forEach(id => {
    statsMap[id] = { total: 0, waiting: 0, active: 0, submitted: 0, total_tab_switches: 0 };
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

  attempts?.forEach(a => {
    const s = statsMap[a.exam_id];
    if (s) {
      s.total_tab_switches += (a.tab_switch_count || 0);
    }
  });

  const enriched = exams.map(e => ({
    ...e,
    participant_count: statsMap[e.id].total,
    waiting_count: statsMap[e.id].waiting,
    active_count: statsMap[e.id].active,
    submitted_count: statsMap[e.id].submitted,
    total_tab_switches: statsMap[e.id].total_tab_switches,
  }));

  return NextResponse.json({ exams: enriched });
}
