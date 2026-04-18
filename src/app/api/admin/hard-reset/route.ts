import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // 1. Critical: Disable in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Dangerous operations are disabled in production mode." },
      { status: 403 }
    );
  }

  // 2. Critical: Require strict confirmation payload
  // BUG-03: Parse body explicitly; fail loudly if invalid JSON
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }
  if (body.confirmation !== "WIPE DATABASE") {
    return NextResponse.json(
      { error: "Confirmation 'WIPE DATABASE' required in payload." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  try {
    // 1. Delete all attempt answers (cascades usually but let's be explicit)
    await supabase.from("attempt_answers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    
    // 2. Delete all attempts
    await supabase.from("attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 3. Delete all exam questions
    await supabase.from("exam_questions").delete().neq("exam_id", "00000000-0000-0000-0000-000000000000");

    // 4. Delete all exam participants
    await supabase.from("exam_participants").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 5. Delete all exams
    await supabase.from("exams").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 6. Delete all questions from global bank
    await supabase.from("questions").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    return NextResponse.json({ success: true, message: "Database wiped clean" });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
