import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // BUG-01: Fix operator precedence
  let userId = user?.id;
  if (!userId && (process.env.ENVIRONMENT === "local")) {
    userId = "00000000-0000-0000-0000-000000000001";
  }

  if (!userId) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  // Use admin client securely to lookup and increment
  const admin = createAdminClient();

  // 1. Securely derive the attempt from server state, NOT client payload
  const { data: attempt } = await admin
    .from("attempts")
    .select("id")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .eq("status", "active") // Only increment for active attempts
    .single();

  if (!attempt) {
    return NextResponse.json(
      { error: "Active attempt not found for this user/exam" },
      { status: 404 }
    );
  }

  // 2. Increment tab_switch_count using atomic RPC
  const { data, error } = await admin.rpc("increment_tab_switch", {
    p_attempt_id: attempt.id,
  });

  // BUG-04: Fallback if RPC is not yet applied to DB.
  // Note: This fallback has a small race window under rapid concurrent tab switches.
  // The primary RPC path above is atomic and preferred.
  if (error) {
    const { data: currentAttempt } = await admin
      .from("attempts")
      .select("tab_switch_count")
      .eq("id", attempt.id)
      .single();

    const newCount = (currentAttempt?.tab_switch_count || 0) + 1;

    await admin
      .from("attempts")
      .update({ tab_switch_count: newCount })
      .eq("id", attempt.id);

    return NextResponse.json({ success: true, count: newCount });
  }

  return NextResponse.json({ success: true, count: data });
}
