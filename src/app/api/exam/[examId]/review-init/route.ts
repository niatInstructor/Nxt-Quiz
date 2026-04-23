import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

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

  // Get attempt
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, server_due_at, status")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .single();

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  // Get questions (direct query)
  const { data: examQuestions } = await admin
    .from("exam_questions")
    .select(`
      position,
      questions (
        id,
        topic,
        question
      )
    `)
    .eq("exam_id", examId)
    .order("position");

  const formattedQuestions = (examQuestions || []).map((eq: any) => ({
    ...eq.questions,
    position: eq.position,
  }));

  // Get answers
  const { data: answers } = await admin
    .from("attempt_answers")
    .select("question_id, selected_option_id, is_bookmarked, is_skipped")
    .eq("attempt_id", attempt.id);

  // Get server time
  const { data: serverTimeData } = await admin.rpc("get_server_time");
  const serverNow = serverTimeData
    ? new Date(serverTimeData).getTime()
    : Date.now();

  return NextResponse.json({
    attempt,
    questions: formattedQuestions,
    answers: answers || [],
    serverNow,
  });
}
