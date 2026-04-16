import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
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

  // Skip static assets
  if (
    path.startsWith("/_next/") ||
    path.startsWith("/favicon.ico") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp)$/.test(path)
  ) {
    return supabaseResponse;
  }

  // Refresh the auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Admin routes — check admin_session cookie
  if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
    const adminSession = request.cookies.get("admin_session")?.value;
    if (adminSession !== "authenticated") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Public routes
  if (
    path === "/login" ||
    path === "/admin/login" ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/api/")
  ) {
    return supabaseResponse;
  }

  // Protect all other routes — require student auth
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
