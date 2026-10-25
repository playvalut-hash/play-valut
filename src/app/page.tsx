import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getBranding } from "./_branding-server";
import GuestLink from "./_guest-link";

/** Auth-gated root: skip prerendering (same convention as the player
 *  layout). The page reads the session cookie to decide between the
 *  marketing page (guests) and a redirect to /app (signed-in players);
 *  `dynamic` is incompatible with this project's cacheComponents
 *  config, `instant = false` is the supported opt-out. */
export const instant = false;

const GAMES = [
  "Juwa 777",
  "Orion Stars",
  "Fire Kirin",
  "Panda Master",
  "Milky Way",
  "Game Vault",
  "Ultra Thunder",
  "Vegas Roll",
];

const PAYMENTS = ["Cash App", "Venmo", "Zelle", "Chime", "Bitcoin"];

const STEPS = [
  {
    n: "1",
    title: "Sign in",
    body: "Sign in with Google or your email — no downloads, everything runs in your browser.",
  },
  {
    n: "2",
    title: "Pick a game, get your login",
    body: "Choose your game and support sets up your account — username and password delivered in chat.",
  },
  {
    n: "3",
    title: "Deposit and play",
    body: "Load with Cash App, Venmo, Zelle, Chime or Bitcoin, verified from your screenshot. Support is on live chat whenever you need them.",
  },
];

/** Public marketing page (v3). Signed-in players skip it and land
 *  straight in the app; guests see the one-page site with Sign in.
 *  Registration is deliberately gone: new players enter with
 *  Continue with Google on the login page (which creates their
 *  account on first sign-in) or as a guest. No admin link anywhere
 *  here — the player side never links to the admin app. */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/app");

  const branding = await getBranding();
  const brand = branding.brand_name || "PlayVault";

  // Marketing page switch (migration 0030, super-admin only): OFF
  // sends every guest straight to /login. Signed-in players already
  // redirected to /app above, so this never locks a player out.
  if (!branding.marketing_page_enabled) redirect("/login");

  return (
    <div className="min-h-dvh bg-[#0b0e14] text-[#eef2f7]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 text-sm font-bold text-[#d4af37]">
            P
          </span>
          <span className="text-[15px] font-bold tracking-wide">{brand}</span>
        </span>
        <span className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-bold text-[#241a02] transition hover:brightness-110"
            style={{ background: "#d4af37" }}
          >
            Sign in
          </Link>
        </span>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-16">
        <section className="py-10 text-center sm:py-16">
          <p className="mx-auto inline-block rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-xs font-semibold text-[#d4af37]">
            Sweepstakes game lobby
          </p>
          <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Your game accounts, deposits and support —{" "}
            <span className="text-[#d4af37]">in one place.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#a7b2c3]">
            {brand} is the front desk for your sweepstakes games. Get your
            game logins set up, load your account in minutes, and reach a
            real person on live chat whenever you need help.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="w-full rounded-xl px-6 py-3.5 text-center text-base font-bold text-[#241a02] transition hover:brightness-110 sm:w-auto"
              style={{ background: "#d4af37" }}
            >
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#6d7a8f]">
            No downloads · Live chat support · For players 18 and over
          </p>
          {branding.guest_mode_enabled ? <GuestLink /> : null}
        </section>

        <section className="py-8">
          <h2 className="text-center text-xl font-bold">How it works</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-[#232c3e] bg-[#151a26] p-5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d4af37] text-sm font-extrabold text-[#241a02]">
                  {s.n}
                </span>
                <h3 className="mt-3 text-base font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#a7b2c3]">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-8">
          <h2 className="text-center text-xl font-bold">Popular games</h2>
          <p className="mt-2 text-center text-sm text-[#a7b2c3]">
            Your favourite sweepstakes titles, managed from one lobby.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {GAMES.map((g) => (
              <div
                key={g}
                className="rounded-xl border border-[#232c3e] bg-[#151a26] px-4 py-3.5 text-center text-sm font-semibold"
              >
                {g}
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-[#6d7a8f]">
            …and more games in the lobby.
          </p>
        </section>

        <section className="py-8">
          <h2 className="text-center text-xl font-bold">Easy deposits</h2>
          <p className="mt-2 text-center text-sm text-[#a7b2c3]">
            Load your account with the payment method you already use.
            Every deposit is verified from your screenshot.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {PAYMENTS.map((p) => (
              <span
                key={p}
                className="rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-4 py-2 text-sm font-semibold text-[#d4af37]"
              >
                {p}
              </span>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-2xl py-8 text-center">
          <h2 className="text-xl font-bold">About {brand}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#a7b2c3]">
            {brand} runs the front desk for sweepstakes players: one
            account for your game logins, deposits and support, with a
            team that answers on live chat. No juggling screenshots
            across apps — your accounts, your deposits and your
            support conversation live in one place.
          </p>
        </section>

        <section className="py-8 text-center">
          <Link
            href="/login"
            className="inline-block rounded-xl px-8 py-3.5 text-base font-bold text-[#241a02] transition hover:brightness-110"
            style={{ background: "#d4af37" }}
          >
            Sign in
          </Link>
          <p className="mt-3 text-sm text-[#a7b2c3]">
            New here? Sign in with Google — your account is created on first sign-in.
          </p>
        </section>
      </main>

      <footer className="border-t border-[#232c3e] py-6 text-center text-xs text-[#6d7a8f]">
        <p>
          {brand} ·{" "}
          <Link href="/login" className="hover:text-[#eef2f7]">
            Sign in
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:text-[#eef2f7]">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-[#eef2f7]">
            Terms
          </Link>
        </p>
        <p className="mt-1">For players 18 and over.</p>
      </footer>
    </div>
  );
}
