import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { signOut } from "./_actions";
import PresenceHeartbeat from "./_presence";
import Tabs from "./_tabs";

/** All pages here are auth-gated: skip prerendering. */
export const instant = false;

/**
 * Player app shell: phone frame on mobile (max-width 440px), full-width
 * like the admin app on desktop, bottom tab bar. Zero admin surface (R8).
 *
 * Blocked players (Build 43) get a lockout screen instead of the app:
 * the players row is checked once per page load (PK lookup), and the
 * chat/deposit actions enforce the same block server-side.
 */
export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let blocked = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await createServiceClient()
        .from("players")
        .select("is_blocked")
        .eq("id", user.id)
        .single();
      blocked = data?.is_blocked === true;
    }
  } catch {
    blocked = false; // never lock everyone out on a lookup hiccup
  }

  if (blocked) {
    return (
      <div className="flex min-h-dvh justify-center bg-near-black">
        <div className="flex w-full max-w-[440px] flex-col items-center justify-center bg-bg px-8 text-center md:max-w-none">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-3xl">
            🚫
          </span>
          <h1 className="mt-5 text-xl font-extrabold text-text-primary">
            Account blocked
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Your PlayVault account has been blocked by the support team. If you
            think this is a mistake, please contact support through the page
            where you found us.
          </p>
          <form action={signOut} className="mt-6">
            <button
              type="submit"
              className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-navy hover:opacity-90"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-near-black flex justify-center">
      {/* Full-width on desktop like the admin app; the phone frame
          applies on mobile only. Navigation is a left sidebar on
          desktop (like the admin's player-list column) and the bottom
          tab bar on mobile. Main gets side padding on desktop so
          nothing sits flush against the window edges. */}
      <div className="relative flex min-h-dvh w-full max-w-[440px] flex-col bg-bg md:max-w-none md:flex-row">
        <Tabs />
        <main className="flex-1 pb-24 md:min-w-0 md:px-6 md:pb-0">
          {children}
        </main>
        <PresenceHeartbeat />
      </div>
    </div>
  );
}
