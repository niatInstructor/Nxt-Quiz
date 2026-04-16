import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nanoid } from "nanoid";
import questionsData from "@/data/react-mcq-50.json";

// GET — list all exams
export async function GET(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();

  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .order("created_at", { ascending: false });

  // Get participant counts
  const enriched = await Promise.all(
    (exams || []).map(async (exam) => {
      const { count } = await supabase
        .from("exam_participants")
        .select("*", { count: "exact", head: true })
        .eq("exam_id", exam.id);

      return { ...exam, participant_count: count || 0 };
    }),
  );

  return NextResponse.json({ exams: enriched });
}

// POST — create new exam
export async function POST(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const { title, durationMinutes, capacity } = await request.json();

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
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
    const { data: newUser } = await supabase.auth.admin.createUser({
      email: "admin@quiz-platform.local",
      password: process.env.ADMIN_PASSWORD || "qwerty",
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
      duration_seconds: (durationMinutes || 40) * 60,
      capacity: capacity || 300,
      status: "waiting",
      created_by: adminId,
    })
    .select()
    .single();

  if (examError) {
    return NextResponse.json({ error: examError.message }, { status: 500 });
  }

  // Seed questions if needed
  const { count: existingQCount } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true });

  if (!existingQCount || existingQCount < 50) {
    const questionInserts = questionsData.map((q: Record<string, unknown>) => ({
      id: q.id,
      topic: q.topic,
      difficulty: q.difficulty,
      question: q.question,
      options: JSON.stringify(q.options),
      correct_option_id: q.correctOptionId,
      explanation: q.explanation,
      tags: q.tags,
    }));

    await supabase
      .from("questions")
      .upsert(questionInserts, { onConflict: "id" });
  }

  // Assign all 50 questions to this exam
  const examQuestions = questionsData.map(
    (q: Record<string, unknown>, i: number) => ({
      exam_id: exam.id,
      question_id: q.id,
      position: i + 1,
      points: 1,
    }),
  );

  await supabase.from("exam_questions").insert(examQuestions);

  return NextResponse.json({
    examId: exam.id,
    examCode: exam.exam_code,
  });
}
