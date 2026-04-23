import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { studentCollegeId, fullName } = await request.json();
  const isLocal = process.env.ENVIRONMENT === "local" || process.env.NEXT_PUBLIC_ENVIRONMENT === "local";

  if (!isLocal) {
    return NextResponse.json({ error: "Only allowed in local dev" }, { status: 403 });
  }

  const admin = createAdminClient();
  const dummyId = "00000000-0000-0000-0000-000000000001";

  // Upsert the dummy profile with all required fields
  const { error } = await admin.from("profiles").upsert({
    id: dummyId,
    student_college_id: studentCollegeId,
    full_name: fullName || "Local Student",
    onboarded_at: new Date().toISOString(),
    email: "local@student.com", // Required field
    role: "student",
    updated_at: new Date().toISOString()
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
