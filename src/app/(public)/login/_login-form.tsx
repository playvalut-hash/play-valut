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

  return (
    <div className="flex min-h-dvh flex-col px-[26px] pb-10 pt-[52px]" style={{ background: "#0b0e14" }}>
      {/* Logo */}
      <div
        className="mx-auto mb-[14px] grid h-[84px] w-[84px] place-items-center rounded-[22px] text-gold"
        style={{
          background: "linear-gradient(145deg, #123524, #0a2317)",
          border: "1px solid rgba(212, 175, 55, 0.45)",
        }}
        aria-hidden
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 21 12 12 22 3 12 12 2Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7.5 16.5 12 12 16.5 7.5 12 12 7.5Z" fill="currentColor" />
        </svg>
      </div>
      <div
        className="text-center text-[26px] font-extrabold tracking-[0.06em]"
        style={{ fontFamily: "var(--font-display)", color: "#eef2f7" }}
      >
        PLAY<span className="text-gold">VAULT</span>
      </div>

      <div className="mx-auto mt-8 w-full max-w-[400px]">
        <h1
          className="text-[28px] font-extrabold"
          style={{ fontFamily: "var(--font-display)", color: "#eef2f7" }}
        >
          {branding.signin_heading || "Welcome Back"}
        </h1>
        <p className="mt-1 text-[15px]" style={{ color: "#a7b2c3" }}>
          {branding.signin_subtext || "Sign in to continue your lobby journey"}
        </p>

        {notice ? (
          <div className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-[#ff6b5e]/40 bg-[#ff6b5e]/10 px-4 py-3 text-sm text-[#ff6b5e]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSignIn} className="mt-6">
          <div className="mb-[14px] flex flex-col gap-[6px]">
            <label htmlFor="loginEmail" className="text-[13px] font-semibold" style={{ color: "#a7b2c3" }}>
              Email
            </label>
            <input
              id="loginEmail"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-[12px] border px-4 py-3 text-[15px] outline-none transition focus:border-gold"
              style={{
                background: "#151a26",
                borderColor: "#232c3e",
                color: "#eef2f7",
              }}
            />
          </div>

          <div className="mb-[14px] flex flex-col gap-[6px]">
            <label htmlFor="loginPass" className="text-[13px] font-semibold" style={{ color: "#a7b2c3" }}>
              Password
            </label>
            <div className="relative">
              <input
                id="loginPass"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-[12px] border px-4 py-3 pr-12 text-[15px] outline-none transition focus:border-gold"
                style={{
                  background: "#151a26",
                  borderColor: "#232c3e",
                  color: "#eef2f7",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                style={{ color: "#6d7a8f" }}
              >
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-[12px] py-[14px] text-[16px] font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            style={{ background: "#d4af37", color: "#241a02" }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1" style={{ background: "#232c3e" }} />
          <span className="text-xs" style={{ color: "#6d7a8f" }}>or</span>
          <span className="h-px flex-1" style={{ background: "#232c3e" }} />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-3 rounded-[12px] border py-3 text-[15px] font-semibold transition"
          style={{
            borderColor: "#232c3e",
            background: "#151a26",
            color: "#eef2f7",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" role="img" aria-label="Google">
            <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z" />
            <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-center text-[14px]" style={{ color: "#a7b2c3" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-bold text-gold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
