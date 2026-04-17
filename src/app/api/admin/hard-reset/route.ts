import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  try {
    // 1. Delete all attempt answers (cascades usually but let's be explicit)
    await supabase.from("attempt_answers").delete().neq("question_id", "0");
    
    // 2. Delete all attempts
    await supabase.from("attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 3. Delete all exam questions
    await supabase.from("exam_questions").delete().neq("question_id", "0");

    // 4. Delete all exam participants
    await supabase.from("exam_participants").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 5. Delete all exams
    await supabase.from("exams").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 6. Delete all questions from global bank
    await supabase.from("questions").delete().neq("id", "0");

    return NextResponse.json({ success: true, message: "Database wiped clean" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
