import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { examCode } = await request.json();

  if (!examCode) {
    return NextResponse.json({ error: "Exam code is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // BUG-01: Fix operator precedence with parentheses
  let userId = user?.id;
  if (!userId && (process.env.ENVIRONMENT === "local")) {
    userId = "00000000-0000-0000-0000-000000000001";
  }

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Check profile onboarding (skip for local bypass dummy ID which is upserted in onboarding page)
  if (userId !== "00000000-0000-0000-0000-000000000001") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("student_college_id, onboarded_at")
      .eq("id", userId)
      .single();

    if (!profile?.student_college_id) {
      return NextResponse.json(
        { error: "Please complete onboarding first" },
        { status: 400 }
      );
    }
  }

  // Use admin client to execute atomic join RPC
  const admin = createAdminClient();

  const { data: examId, error } = await admin.rpc("join_exam", {
    p_exam_code: examCode.trim().toUpperCase(),
    p_user_id: userId,
  });

  if (error) {
    // Check specific error messages from Postgres RAISE EXCEPTION
    if (error.message.includes("Invalid exam code")) {
      return NextResponse.json({ error: "Invalid exam code" }, { status: 404 });
    }
    if (error.message.includes("removed from this exam")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error.message.includes("join window is closed") || error.message.includes("full capacity")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ examId });
}
