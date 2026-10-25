import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveGameIconUrl } from "@/lib/game-icon";
import { getBranding } from "./_branding-server";
import GuestLink from "./_guest-link";
import MarketingHeader from "./_marketing-header";
import ContactForm from "./_contact-form";

/** Auth-gated root: skip prerendering (same convention as the player
 *  layout). The page reads the session cookie to decide between the
 *  marketing site (guests) and a redirect to /app (signed-in players);
 *  `dynamic` is incompatible with this project's cacheComponents
 *  config, `instant = false` is the supported opt-out. */
export const instant = false;

/** Fallbacks when the public catalog reads fail (or before any game
 *  is marked active): the sections never render empty. */
const FALLBACK_GAMES = [
  "Juwa 777",
  "Orion Stars",
  "Fire Kirin",
  "Panda Master",
  "Milky Way",
  "Game Vault",
  "Ultra Thunder",
  "Vegas Roll",
];

const FALLBACK_PAYMENTS = ["Cash App", "Venmo", "Zelle", "Chime", "Bitcoin"];

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

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Public marketing site (v3). Signed-in players skip it and land
 *  straight in the app; guests see the full one-page site with
 *  working navigation (Home, Games, How it works, Deposits, About,
 *  Contact), live game/payment catalogs from the public policies,
 *  and a contact form that lands in the super-admin dashboard.
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

  // Public catalog reads (anon role, public SELECT policies on
  // games/payment_methods filter to active rows automatically).
  // Names only for payment methods — account handles stay private to
  // signed-in players. Any failure falls back to the static lists.
  let games: Array<{
    id: string;
    name: string;
    iconUrl: string | null;
  }> = [];
  let payments: string[] = [];
  try {
    const { data: gameRows } = await supabase
      .from("games")
      .select("id, name, icon_path, custom_icon_path")
      .order("name", { ascending: true });
    games = ((gameRows ?? []) as Array<{
      id: string;
      name: string;
      icon_path: string | null;
      custom_icon_path: string | null;
    }>).map((g) => ({
      id: g.id,
      name: g.name,
      iconUrl: resolveGameIconUrl(g.icon_path, g.custom_icon_path),
    }));
  } catch {
    games = [];
  }
  try {
    const { data: methodRows } = await supabase
      .from("payment_methods")
      .select("name")
      .order("name", { ascending: true });
    payments = ((methodRows ?? []) as Array<{ name: string }>).map(
      (m) => m.name,
    );
  } catch {
    payments = [];
  }
  const showGames =
    games.length > 0
      ? games
      : FALLBACK_GAMES.map((name) => ({ id: name, name, iconUrl: null }));
  const showPayments = payments.length > 0 ? payments : FALLBACK_PAYMENTS;

  return (
    <div className="min-h-dvh bg-[#0b0e14] text-[#eef2f7]">
      <MarketingHeader brand={brand} />

      <main className="mx-auto w-full max-w-6xl px-5 pb-16">
        {/* ── Home / hero ─────────────────────────────────────────── */}
        <section id="home" className="scroll-mt-20 py-12 text-center sm:py-20">
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
            <Link
              href="#games"
              className="w-full rounded-xl border border-[#232c3e] bg-[#151a26] px-6 py-3.5 text-center text-base font-bold transition hover:border-[#d4af37]/60 sm:w-auto"
            >
              Browse games
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#6d7a8f]">
            No downloads · Live chat support · For players 18 and over
          </p>
          {branding.guest_mode_enabled ? <GuestLink /> : null}
        </section>

        {/* ── Games ───────────────────────────────────────────────── */}
        <section id="games" className="scroll-mt-20 py-10">
          <h2 className="text-center text-2xl font-bold">Popular games</h2>
          <p className="mt-2 text-center text-sm text-[#a7b2c3]">
            Your favourite sweepstakes titles, managed from one lobby.
            Sign in and support sets your login up in chat.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {showGames.map((g) => (
              <div
                key={g.id}
                className="overflow-hidden rounded-2xl border border-[#232c3e] bg-[#151a26] transition hover:border-[#d4af37]/60"
              >
                <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-[#123524] to-[#0a2317]">
                  <span className="text-2xl font-extrabold tracking-wide text-[#d4af37]">
                    {initials(g.name)}
                  </span>
                  {g.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.iconUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="p-4 text-center">
                  <p className="text-sm font-bold">{g.name}</p>
                  <Link
                    href="/login"
                    className="mt-2.5 inline-block rounded-lg px-4 py-2 text-xs font-bold text-[#241a02] transition hover:brightness-110"
                    style={{ background: "#d4af37" }}
                  >
                    Sign in to play
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 py-10">
          <h2 className="text-center text-2xl font-bold">How it works</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
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

        {/* ── Deposits ────────────────────────────────────────────── */}
        <section id="deposits" className="scroll-mt-20 py-10">
          <h2 className="text-center text-2xl font-bold">Easy deposits</h2>
          <p className="mt-2 text-center text-sm text-[#a7b2c3]">
            Load your account with the payment method you already use.
            Every deposit is verified from your screenshot — nothing is
            charged automatically, and support confirms each load in chat.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {showPayments.map((p) => (
              <span
                key={p}
                className="rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-4 py-2 text-sm font-semibold text-[#d4af37]"
              >
                {p}
              </span>
            ))}
          </div>
        </section>

        {/* ── About ───────────────────────────────────────────────── */}
        <section id="about" className="mx-auto max-w-2xl scroll-mt-20 py-10 text-center">
          <h2 className="text-2xl font-bold">About {brand}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#a7b2c3]">
            {brand} runs the front desk for sweepstakes players: one
            account for your game logins, deposits and support, with a
            team that answers on live chat. No juggling screenshots
            across apps — your accounts, your deposits and your
            support conversation live in one place.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#a7b2c3]">
            The games themselves run on their own platforms — {brand}{" "}
            manages your access to them and verifies your deposits by
            hand. If you ever need help, the Contact section below
            reaches support directly.
          </p>
        </section>

        {/* ── Contact ─────────────────────────────────────────────── */}
        <section id="contact" className="scroll-mt-20 py-10">
          <h2 className="text-center text-2xl font-bold">Contact support</h2>
          <p className="mt-2 text-center text-sm text-[#a7b2c3]">
            Questions about an account or a deposit? Send a message —
            support sees it on the dashboard and replies to your email.
          </p>
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#232c3e] bg-[#151a26] p-5">
              <h3 className="text-base font-bold">Reach us directly</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#a7b2c3]">
                Prefer email? Write to us and include your player name
                so support can find your account faster.
              </p>
              <a
                href="mailto:playvalut@gmail.com"
                className="mt-4 inline-block rounded-lg px-4 py-2.5 text-sm font-bold text-[#241a02] transition hover:brightness-110"
                style={{ background: "#d4af37" }}
              >
                playvalut@gmail.com
              </a>
              <p className="mt-4 text-xs leading-relaxed text-[#6d7a8f]">
                For players 18 and over. Support hours follow the live
                chat team — messages sent here are answered in turn.
              </p>
            </div>
            <div className="rounded-2xl border border-[#232c3e] bg-[#151a26] p-5">
              <ContactForm />
            </div>
          </div>
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

      <footer className="border-t border-[#232c3e] py-8 text-center text-xs text-[#6d7a8f]">
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>{brand}</span>
          <Link href="#home" className="hover:text-[#eef2f7]">Home</Link>
          <Link href="#games" className="hover:text-[#eef2f7]">Games</Link>
          <Link href="#about" className="hover:text-[#eef2f7]">About</Link>
          <Link href="#contact" className="hover:text-[#eef2f7]">Contact</Link>
          <Link href="/login" className="hover:text-[#eef2f7]">Sign in</Link>
          <Link href="/privacy" className="hover:text-[#eef2f7]">Privacy</Link>
          <Link href="/terms" className="hover:text-[#eef2f7]">Terms</Link>
        </p>
        <p className="mt-2">For players 18 and over.</p>
      </footer>
    </div>
  );
}
