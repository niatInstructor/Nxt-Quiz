import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;

  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const { data: participants } = await supabase
    .from("exam_participants")
    .select(
      `
      id,
      user_id,
      status,
      joined_at,
      started_at,
      submitted_at,
      profiles (
        full_name,
        email,
        student_college_id
      )
    `,
    )
    .eq("exam_id", examId)
    .order("joined_at", { ascending: true });

  return NextResponse.json({
    exam,
    participants: participants || [],
  });
}
