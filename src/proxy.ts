import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const path = request.nextUrl.pathname;
  const isLocal = process.env.ENVIRONMENT === "local";

  // 1. Skip static assets
  if (
    path.startsWith("/_next/") ||
    path.startsWith("/favicon.ico") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp)$/.test(path)
  ) {
    return supabaseResponse;
  }

  // 2. Refresh/Get the auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 3. Centralized Admin Protection
  const isAdminPath =
    (path.startsWith("/admin") && path !== "/admin/login") ||
    (path.startsWith("/api/admin/") && path !== "/api/admin/login");

  if (isAdminPath) {
    // LOCAL BYPASS: Allow admin access in local dev even without session
    if (isLocal) {
      return supabaseResponse;
    }

    if (!user) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Auth required" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/exam/join";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  // 4. Public routes
  if (
    path === "/login" ||
    path === "/admin/login" ||
    path === "/api/admin/login" ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/api/")
  ) {
    // LOCAL BYPASS: If on student login page and in local mode, redirect to onboarding immediately
    if (path === "/login" && isLocal) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
    // LOCAL BYPASS: If on admin login page and in local mode, redirect to admin dashboard immediately
    if (path === "/admin/login" && isLocal) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 5. Protect all other routes — require student auth
  // LOCAL BYPASS: Allow onboarding/exam paths without auth if in local mode
  if (!user && !isLocal) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
