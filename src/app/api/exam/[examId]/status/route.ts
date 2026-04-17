import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("title, status, capacity, duration_seconds")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const { count } = await supabase
    .from("exam_participants")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId)
    .in("status", ["waiting", "active"]);

  return NextResponse.json({
    title: exam.title,
    status: exam.status,
    capacity: exam.capacity,
    durationSeconds: exam.duration_seconds,
    participantCount: count || 0,
  });
}
