import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  const cookies = request.headers.get("cookie") || "";
  if (!cookies.includes("admin_session=authenticated")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from("exam_questions")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: count || 0 });
}
