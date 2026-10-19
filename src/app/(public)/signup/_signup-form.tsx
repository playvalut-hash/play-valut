"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { BrandMark, BrandName, brandLogoUrl, type Branding } from "../../_branding";

export default function SignupForm({ branding }: { branding: Branding }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifySent, setVerifySent] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) {
      setError("Please enter your display name.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter your email and a password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        router.push("/app");
        router.refresh();
      } else {
        // Email confirmation required: players row is created by the DB trigger.
        setVerifySent(true);
      }
    } finally {
      setLoading(false);
    }
  }

  const logoUrl = brandLogoUrl(branding.logo_path);

  return (
    <div className="min-h-dvh bg-near-black flex items-center justify-center p-4 sm:p-8">
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
              Create your account
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              One account for every game in the lobby.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}
          {verifySent ? (
            <div
              role="status"
              className="mt-6 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
            >
              Account created! Check your inbox to verify your email, then sign
              in.
            </div>
          ) : null}

          <form onSubmit={handleSignup} className="mt-6 space-y-4">
            <label className="block">
              <span className="sr-only">Display name</span>
              <span className="flex items-center gap-3 rounded-xl border border-gold/50 bg-surface-input px-4 py-3.5 focus-within:border-gold focus-within:ring-1 focus-within:ring-gold/50 transition">
                <UserIcon className="h-5 w-5 shrink-0 text-gold" />
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-transparent text-base text-text-primary placeholder:text-text-muted focus:outline-none"
                />
              </span>
            </label>

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

            <label className="block">
              <span className="sr-only">Password</span>
              <span className="flex items-center gap-3 rounded-xl border border-gold/50 bg-surface-input px-4 py-3.5 focus-within:border-gold focus-within:ring-1 focus-within:ring-gold/50 transition">
                <ShieldIcon className="h-5 w-5 shrink-0 text-gold" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Password (min. 6 characters)"
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

            <button
              type="submit"
              disabled={loading || verifySent}
              className="w-full rounded-xl bg-gold py-4 text-base font-bold text-text-ongold shadow-[0_4px_20px_rgba(212,175,55,0.25)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60 min-h-[56px]"
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-gold hover:text-gold-light transition"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
