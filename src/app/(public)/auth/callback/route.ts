import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * OAuth / email-confirmation callback: exchange the code for a session,
 * then land on /app. The DB trigger creates the players row for
 * brand-new users.
 *
 * Guest conversion fill-in (best-effort, errors ignored): when an
 * anonymous guest converts via Google link or email confirmation, the
 * players row still has the Guest- name and a NULL email from the
 * trigger. Fill the email and replace ONLY a Guest- placeholder name
 * with the real name — never overwrite a name the player already has.
 * For ordinary sign-ins this is a no-op (the trigger already set both).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: row } = await supabase
            .from("players")
            .select("email, display_name")
            .eq("id", user.id)
            .maybeSingle();
          const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
          const realName =
            (typeof meta.full_name === "string" && meta.full_name) ||
            (typeof meta.display_name === "string" && meta.display_name) ||
            (user.email ? user.email.split("@")[0] : null);
          const patch: { email?: string; display_name?: string } = {};
          if (row && !row.email && user.email) patch.email = user.email;
          if (
            row &&
            typeof row.display_name === "string" &&
            row.display_name.startsWith("Guest-") &&
            realName
          ) {
            patch.display_name = realName;
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("players").update(patch).eq("id", user.id);
          }
        }
      } catch {
        // Best-effort only — the session is already established.
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
