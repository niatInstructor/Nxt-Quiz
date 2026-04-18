import { createClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";

export async function getAdminUser(): Promise<User | null> {
  const isLocal = process.env.ENVIRONMENT === "local";
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // LOCAL BYPASS: If no user and in local mode, return a dummy admin user
  if (!user && isLocal) {
    return {
      id: "00000000-0000-0000-0000-000000000000", // Constant local dummy admin ID
      email: "admin@local.test",
      user_metadata: { full_name: "Local Administrator" },
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: {},
    } as User;
  }

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin" ? user : null;
}
