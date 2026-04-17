import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — list all students
export async function GET(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, student_college_id, role, onboarded_at, created_at")
    .neq("role", "admin")
    .order("created_at", { ascending: false });

  return NextResponse.json({ students: profiles || [] });
}

// DELETE — remove a student entirely (delete profile + auth user)
export async function DELETE(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { userId, deleteAll } = await request.json();
  const supabase = createAdminClient();

  if (deleteAll) {
    // 1. Get all student IDs
    const { data: students } = await supabase
      .from("profiles")
      .select("id")
      .neq("role", "admin");

    if (students && students.length > 0) {
      const ids = students.map((s) => s.id);
      
      // We must delete auth users one-by-one (Supabase restriction)
      for (const id of ids) {
        await supabase.auth.admin.deleteUser(id);
      }
    }
    return NextResponse.json({ success: true, count: students?.length || 0 });
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Delete all related data is handled by cascading if we delete the auth user
  // but let's be explicit to ensure all tables are cleared.
  
  // 1. Get all attempts
  const { data: attempts } = await supabase
    .from("attempts")
    .select("id")
    .eq("user_id", userId);

  if (attempts && attempts.length > 0) {
    const attemptIds = attempts.map((a) => a.id);
    await supabase.from("attempt_answers").delete().in("attempt_id", attemptIds);
  }

  // 2. Delete attempts
  await supabase.from("attempts").delete().eq("user_id", userId);

  // 3. Delete participations
  await supabase.from("exam_participants").delete().eq("user_id", userId);

  // 4. Delete profile (cascade from auth if needed)
  await supabase.from("profiles").delete().eq("id", userId);

  // 5. Delete auth user
  await supabase.auth.admin.deleteUser(userId);

  return NextResponse.json({ success: true });
}

// PATCH — update a student's profile
export async function PATCH(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { userId, full_name, student_college_id } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("profiles")
      .update({ full_name, student_college_id })
      .eq("id", userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
