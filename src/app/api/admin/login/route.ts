import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";

// SEC-04: Basic in-memory rate limiter
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // SEC-04: Rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && (now - record.lastAttempt) < WINDOW_MS && record.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { password } = body;
  const adminEmail = "admin@quiz-platform.local";
  const envPwd = process.env.ADMIN_PASSWORD?.trim();

  // SEC-09: Only log in non-production
  if (process.env.NODE_ENV !== "production") {
    console.log("--- ADMIN LOGIN ATTEMPT ---");
  }
  
  // 1. Validation
  if (!envPwd || envPwd.length === 0) {
    return NextResponse.json({ error: "Server Error: ADMIN_PASSWORD not set." }, { status: 500 });
  }

  if (process.env.NODE_ENV === "production" && envPwd === "qwerty") {
    return NextResponse.json({ error: "Security Error: Default password in production." }, { status: 500 });
  }

  // SEC-10: Timing-safe comparison
  const isMatch = password && safeCompare(password.trim(), envPwd);
  if (!isMatch) {
    // SEC-04: Track failed attempt
    loginAttempts.set(ip, {
      count: (record?.count || 0) + 1,
      lastAttempt: now,
    });
    return NextResponse.json({ error: "Invalid password (Input Mismatch)" }, { status: 401 });
  }

  // Clear rate limit on success
  loginAttempts.delete(ip);

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 2. Auto-Sync Admin Account to Supabase Auth
  if (true) {
    const { data: users } = await adminClient.auth.admin.listUsers();
    const existingAdmin = users.users.find(u => u.email === adminEmail);

    if (existingAdmin) {
      console.log("System DB Sync: Admin exists, auto-syncing password...");
      await adminClient.auth.admin.updateUserById(existingAdmin.id, { 
        password: envPwd,
        email_confirm: true 
      });
    } else {
      console.log("System DB Sync: Creating fresh admin account in Auth...");
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: envPwd,
        email_confirm: true,
        user_metadata: { full_name: "Administrator" },
      });

      if (createError) {
        console.error("User Creation Failed:", createError.message);
      } else if (newUser.user) {
        // Ensure role is set
        await adminClient.from("profiles").upsert({ 
          id: newUser.user.id, 
          role: "admin",
          full_name: "Administrator",
          email: adminEmail 
        });
      }
    }
  }

  // 3. Authenticate
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: envPwd,
  });

  if (signInError) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Auth Error:", signInError.message);
    }
    
    return NextResponse.json({ 
      error: "Authentication failed. " + signInError.message + ". If you just reset, try logging in one more time." 
    }, { status: 401 });
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("Login Successful for:", data.user?.email);
  }
  return NextResponse.json({ success: true });
}
