import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route gating (session presence only).
 *
 *  • /app/*        requires a session        → else redirect /login
 *  • /login,/signup public; session → redirect /app
 *  • /admin/login  public (no link from player app; see R8)
 *  • /admin/*      requires a session        → else redirect /admin/login
 *
 * Deep role checks (admin_users membership) happen in the admin layout via the
 * service client — this proxy intentionally only checks session presence.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: never trust session presence for authorization — always re-check
  // the user server-side. getSession() reads from cookies (no network call);
  // full token validation via getUser() happens in layouts/server components.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  const isAdminLogin = pathname === "/admin/login";
  const isPlayerArea = pathname === "/app" || pathname.startsWith("/app/");
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAuthPage) {
    // Signed-in players don't need the auth pages.
    if (user) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return supabaseResponse;
  }

  if (isAdminLogin) {
    // Public: the admin layout handles role verification + signed-out redirects.
    return supabaseResponse;
  }

  if (isPlayerArea) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return supabaseResponse;
  }

  if (isAdminArea) {
    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/login", "/signup"],
};
