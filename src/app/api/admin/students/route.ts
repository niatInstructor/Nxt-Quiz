import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { isValidStudentId } from "@/lib/student-id";

// GET — list all students
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      `
      id, 
      full_name, 
      email, 
      student_college_id, 
      role, 
      onboarded_at, 
      created_at,
      exam_participants (
        status,
        exams (
          title
        )
      )
    `
    )
    .neq("role", "admin")
    .order("created_at", { ascending: false });

  return NextResponse.json({ students: profiles || [] });
}

// DELETE — remove a student entirely (delete profile + auth user)
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { userId, deleteAll, confirmation } = await request.json().catch(() => ({}));

  // 1. Critical: Require strict confirmation
  if (deleteAll && confirmation !== "DELETE ALL STUDENTS") {
    return NextResponse.json(
      { error: "Confirmation 'DELETE ALL STUDENTS' required for bulk deletion." },
      { status: 400 }
    );
  }

  // 2. Critical: Disable bulk deletion in production
  if (deleteAll && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Bulk deletion is disabled in production." },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  if (deleteAll) {
    const { data: students } = await supabase
      .from("profiles")
      .select("id")
      .neq("role", "admin");

    if (students && students.length > 0) {
      const ids = students.map((s) => s.id);
      for (const id of ids) {
        await supabase.auth.admin.deleteUser(id);
      }
    }
    return NextResponse.json({ success: true, count: students?.length || 0 });
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Manual cleanup to ensure consistency
  const { data: attempts } = await supabase
    .from("attempts")
    .select("id")
    .eq("user_id", userId);

  if (attempts && attempts.length > 0) {
    const attemptIds = attempts.map((a) => a.id);
    await supabase.from("attempt_answers").delete().in("attempt_id", attemptIds);
  }

  await supabase.from("attempts").delete().eq("user_id", userId);
  await supabase.from("exam_participants").delete().eq("user_id", userId);
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.auth.admin.deleteUser(userId);

  return NextResponse.json({ success: true });
}

// PATCH — update a student's profile
export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { userId, full_name, student_college_id } = await request.json().catch(() => ({}));
    if (!userId || !full_name || !student_college_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // SEC-12: Validate inputs
    if (typeof full_name !== "string" || full_name.trim().length < 1 || full_name.length > 200) {
      return NextResponse.json({ error: "Invalid name (must be 1-200 characters)" }, { status: 400 });
    }
    if (!isValidStudentId(student_college_id)) {
      return NextResponse.json({ error: "Invalid student college ID format" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("profiles")
      .update({ full_name, student_college_id })
      .eq("id", userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
