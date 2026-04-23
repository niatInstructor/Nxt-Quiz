import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userId = user?.id;
  const isLocal = process.env.ENVIRONMENT === "local" || process.env.NEXT_PUBLIC_ENVIRONMENT === "local";
  
  if (!userId && isLocal) {
    userId = "00000000-0000-0000-0000-000000000001";
  }

  if (!userId) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: attempts } = await admin
    .from("attempts")
    .select(`
      exam_id,
      total_score,
      max_score,
      submitted_at,
      exams (
        title
      )
    `)
    .eq("user_id", userId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  return NextResponse.json({
    attempts: attempts || [],
    userName: user?.user_metadata?.full_name || (isLocal ? "Local Student" : "Student"),
  });
}
