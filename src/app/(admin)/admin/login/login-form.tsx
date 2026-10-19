"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { adminSignIn } from "../../_actions";
import { EyeIcon, EyeOffIcon, ShieldIcon } from "@/components/icons";

/** Admin sign-in form. Posts to the adminSignIn server action. */
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminSignIn({ email: email.trim(), password });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-near-black px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-card p-8 shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
            <ShieldIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              PlayVault Admin
            </h1>
            <p className="mt-1 text-xs text-text-secondary">
              Sign in with your agent account
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </div>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">
            Email
          </span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="admin-focus w-full rounded-md border border-surface-border bg-surface-input px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted"
            placeholder="agent@example.com"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">
            Password
          </span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-focus w-full rounded-md border border-surface-border bg-surface-input px-3 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
            >
              {showPassword ? (
                <EyeOffIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="admin-focus w-full rounded-md bg-gold px-4 py-2.5 text-sm font-semibold text-navy transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
