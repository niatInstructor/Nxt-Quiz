import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Check if user already onboarded
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("student_college_id, onboarded_at")
          .eq("id", user.id)
          .single();

        if (profile?.onboarded_at && profile?.student_college_id) {
          return NextResponse.redirect(`${origin}/exam/join`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If anything failed, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
