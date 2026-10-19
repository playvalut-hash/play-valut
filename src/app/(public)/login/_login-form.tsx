"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { BrandMark, BrandName, brandLogoUrl, type Branding } from "../../_branding";

export default function LoginForm({
  branding,
  oauthError,
}: {
  branding: Branding;
  oauthError: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [resetSent, setResetSent] = useState(false);
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

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/login` },
      );
      if (resetError) {
        setError("Couldn't send the reset email. Please try again later.");
        return;
      }
      setResetSent(true);
    } finally {
      setLoading(false);
    }
  }

  const logoUrl = brandLogoUrl(branding.logo_path);

  return (
    <div className="min-h-dvh bg-near-black flex items-center justify-center p-4 sm:p-8">
      {/* navy wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(212,175,55,0.08), transparent 70%), radial-gradient(80% 60% at 50% 100%, rgba(12,20,36,0.9), transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-[560px]">
        <div className="rounded-2xl border border-surface-border bg-navy/90 p-6 sm:p-10 shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="flex flex-col items-center text-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${branding.brand_name} logo`}
                className="h-14 w-14 rounded-xl object-contain"
              />
            ) : (
              <BrandMark size={56} />
            )}
            <BrandName
              name={branding.brand_name}
              className="mt-4 text-3xl font-extrabold tracking-tight"
            />
            <h1 className="mt-6 text-xl font-bold text-text-primary">
              {branding.signin_heading}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              {branding.signin_subtext}
            </p>
          </div>

          {notice ? (
            <div
              role="status"
              className="mt-6 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-light"
            >
              {notice}
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={mode === "signin" ? handleSignIn : handleForgot} className="mt-6 space-y-4">
            <label className="block">
              <span className="sr-only">Email</span>
              <span className="flex items-center gap-3 rounded-xl border border-gold/50 bg-surface-input px-4 py-3.5 focus-within:border-gold focus-within:ring-1 focus-within:ring-gold/50 transition">
                <UserIcon className="h-5 w-5 shrink-0 text-gold" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent text-base text-text-primary placeholder:text-text-muted focus:outline-none"
                />
              </span>
            </label>

            {mode === "signin" ? (
              <label className="block">
                <span className="sr-only">Password</span>
                <span className="flex items-center gap-3 rounded-xl border border-gold/50 bg-surface-input px-4 py-3.5 focus-within:border-gold focus-within:ring-1 focus-within:ring-gold/50 transition">
                  <ShieldIcon className="h-5 w-5 shrink-0 text-gold" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-base text-text-primary placeholder:text-text-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="shrink-0 rounded p-1 text-text-secondary hover:text-gold transition"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </span>
              </label>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gold py-4 text-base font-bold text-text-ongold shadow-[0_4px_20px_rgba(212,175,55,0.25)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60 min-h-[56px]"
            >
              {loading
                ? mode === "signin"
                  ? "Signing in…"
                  : "Sending…"
                : mode === "signin"
                  ? "Sign In"
                  : "Send reset link"}
            </button>
          </form>

          {mode === "forgot" ? (
            resetSent ? (
              <div
                role="status"
                className="mt-6 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
              >
                Reset link sent — check your inbox, then sign in with your new
                password.
              </div>
            ) : null
          ) : null}

          {mode === "signin" ? (
            <>
              <div className="my-6 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-surface-border" />
                <span className="text-xs text-text-muted">or</span>
                <span className="h-px flex-1 bg-surface-border" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-surface-border bg-surface-card py-3.5 text-base font-semibold text-text-primary transition hover:border-gold/60 min-h-[52px]"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="Google"
                >
                  <path
                    fill="#4285F4"
                    d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"
                  />
                </svg>
                Continue with Google
              </button>
            </>
          ) : null}

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link
              href="/signup"
              className="font-semibold text-gold hover:text-gold-light transition"
            >
              Create an account
            </Link>
            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setNotice(null);
                }}
                className="text-text-secondary hover:text-text-primary transition"
              >
                Forgot password?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setResetSent(false);
                  setError(null);
                }}
                className="text-text-secondary hover:text-text-primary transition"
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-text-muted">
          By signing in you agree to play responsibly.
        </p>
      </div>
    </div>
  );
}
