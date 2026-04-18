import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nanoid } from "nanoid";
import { getAdminUser } from "@/lib/admin-auth";

// GET — list all exams
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // STD-02: Single query with relation count instead of N+1
  const supabase = createAdminClient();
  const { data: exams } = await supabase
    .from("exams")
    .select("*, exam_participants(count)")
    .order("created_at", { ascending: false });

  const enriched = (exams || []).map((exam) => ({
    ...exam,
    participant_count: (exam as Record<string, unknown> & { exam_participants: { count: number }[] }).exam_participants?.[0]?.count || 0,
  }));

  // Get total questions count for dashboard
  const { count: questionsCount } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({ exams: enriched, questionsCount: questionsCount || 0 });
}

// POST — create new exam
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { title, durationMinutes, capacity } = await request.json();

  if (
    !title ||
    typeof title !== "string" ||
    title.trim().length === 0 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isInteger(capacity) ||
    capacity <= 0
  ) {
    return NextResponse.json({ error: "Invalid exam payload" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const examCode = `RCT-${nanoid(4).toUpperCase()}`;

  // We need a profile for created_by. Since admin uses password auth,
  // we'll use service role to create the exam with a sentinel admin ID.
  // First, check if admin profile exists or create one.
  let adminId: string;
  const { data: adminProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1);

  if (adminProfiles && adminProfiles.length > 0) {
    adminId = adminProfiles[0].id;
  } else {
    // Create an admin user in auth and profiles
    // Use envPwd directly, failing if missing (consistent with login route)
    const envPwd = process.env.ADMIN_PASSWORD?.trim();
    if (!envPwd || (process.env.NODE_ENV === "production" && envPwd === "qwerty")) {
      return NextResponse.json({ error: "Admin password not securely configured" }, { status: 500 });
    }

    const { data: newUser } = await supabase.auth.admin.createUser({
      email: "admin@quiz-platform.local",
      password: envPwd,
      email_confirm: true,
      user_metadata: { full_name: "Administrator" },
    });

    if (!newUser.user) {
      return NextResponse.json(
        { error: "Failed to create admin user" },
        { status: 500 },
      );
    }

    adminId = newUser.user.id;

    // Set role to admin
    await supabase.from("profiles").update({ role: "admin" }).eq("id", adminId);
  }

  // Create exam
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .insert({
      exam_code: examCode,
      title,
      duration_seconds: durationMinutes * 60,
      capacity: capacity,
      status: "waiting",
      created_by: adminId,
    })
    .select()
    .single();

  if (examError) {
    return NextResponse.json({ error: examError.message }, { status: 500 });
  }

  return NextResponse.json({
    examId: exam.id,
    examCode: exam.exam_code,
  });
}
