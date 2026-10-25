"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

export default function LoginForm({
  branding,
  oauthError,
}: {
  branding: { brand_name: string; signin_heading: string; signin_subtext: string };
  oauthError: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    oauthError ? "Google sign-in isn't set up yet — use email instead." : null,
  );

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("Invalid email or password. Please try again.");
        return;
      }
      router.push("/app");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthErr) {
        setNotice("Google sign-in isn't set up yet — use email instead.");
      }
    } catch {
      setNotice("Google sign-in isn't set up yet — use email instead.");
    }
  }

  /** Guest entry: an anonymous Supabase session (no email, no password).
   *  The session IS a real session, so the proxy lets it straight into
   *  /app — games and chat work exactly like a signed-in player. The
   *  guest later converts the SAME user (linkIdentity / updateUser),
   *  so the chat carries over instead of being lost. Until anonymous
   *  sign-ins are enabled in the Supabase dashboard this fails soft
   *  with the same graceful notice as the Google button. */
  async function handleGuest() {
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error: guestErr } = await supabase.auth.signInAnonymously();
      if (guestErr) {
        setNotice("Guest sign-in isn't enabled yet — sign in with Google or email.");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setNotice("Guest sign-in isn't enabled yet — sign in with Google or email.");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-6 pb-10 pt-12" style={{ background: "#0c1424" }}>
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div
          className="mx-auto grid h-[84px] w-[84px] place-items-center rounded-[22px] text-gold"
          style={{
            background: "linear-gradient(145deg, #123524, #0a2317)",
            border: "1px solid rgba(212, 175, 55, 0.45)",
          }}
          aria-hidden
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 21 12 12 22 3 12 12 2Z" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 7.5 16.5 12 12 16.5 7.5 12 12 7.5Z" fill="currentColor" />
          </svg>
        </div>
        <div
          className="mt-3 text-center text-[26px] font-extrabold tracking-wide"
          style={{ fontFamily: "var(--font-display)", color: "#eef2f7" }}
        >
          <span>Play</span><span className="text-gold">Vault</span>
        </div>

        <h1
          className="mt-8 text-[28px] font-extrabold"
          style={{ fontFamily: "var(--font-display)", color: "#eef2f7" }}
        >
          {branding.signin_heading || "Welcome Back"}
        </h1>
        <p className="mt-1 text-[15px]" style={{ color: "#a7b2c3" }}>
          {branding.signin_subtext || "Sign in to continue your lobby journey"}
        </p>

        {notice && (
          <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-[#ff6b5e]/40 bg-[#ff6b5e]/10 px-4 py-3 text-sm text-[#ff6b5e]">
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="mt-6 space-y-3.5">
          {/* Email with icon */}
          <div
            className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
            style={{ background: "#151a26", borderColor: "#232c3e" }}
          >
            <span className="shrink-0" style={{ color: "#6d7a8f" }} aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              autoComplete="email"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-[#6d7a8f]"
              style={{ color: "#eef2f7" }}
            />
          </div>

          {/* Password with icon */}
          <div
            className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
            style={{ background: "#151a26", borderColor: "#232c3e" }}
          >
            <span className="shrink-0" style={{ color: "#6d7a8f" }} aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-[#6d7a8f]"
              style={{ color: "#eef2f7" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="shrink-0 p-1"
              style={{ color: "#6d7a8f" }}
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>

          {/* Sign In with arrow */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            style={{ background: "#d4af37", color: "#241a02" }}
          >
            {loading ? "Signing in…" : (
              <>
                Sign In
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 12h15M13 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="mt-3 text-center">
          <Link href="/forgot" className="text-[13px] text-text-muted hover:text-gold">
            Forgot password?
          </Link>
        </div>

        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1" style={{ background: "#232c3e" }} />
          <span className="text-xs" style={{ color: "#6d7a8f" }}>or</span>
          <span className="h-px flex-1" style={{ background: "#232c3e" }} />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border py-3.5 text-[15px] font-semibold transition hover:border-gold/50"
          style={{ borderColor: "#232c3e", background: "#151a26", color: "#eef2f7" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" role="img" aria-label="Google">
            <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z" />
            <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
          </svg>
          Continue with Google
        </button>

        <button
          type="button"
          onClick={handleGuest}
          className="mt-3 w-full text-center text-[14px] font-semibold text-gold hover:underline"
        >
          or continue as guest
        </button>
      </div>
    </div>
  );
}
