"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** Forgot-password form. Sends a Supabase reset email whose link
 *  lands on /reset-password (that URL must be in the Supabase
 *  Redirect URLs allowlist, same page as /auth/callback). The notice
 *  never reveals whether the email has an account — Supabase
 *  returns success either way, and the copy says so. */
export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (resetError) {
        setError("Couldn't send the reset link — try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Couldn't send the reset link — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-6 pb-10 pt-12" style={{ background: "#0c1424" }}>
      <div className="w-full max-w-[400px]">
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
          Forgot password?
        </h1>
        <p className="mt-1 text-[15px]" style={{ color: "#a7b2c3" }}>
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-[#ff6b5e]/40 bg-[#ff6b5e]/10 px-4 py-3 text-sm text-[#ff6b5e]">
            {error}
          </div>
        )}

        {sent ? (
          <div className="mt-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-gold">
            Check your inbox — if that email has an account, a reset link
            is on its way. The link opens here, where you&apos;ll choose a
            new password.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
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
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl py-4 text-[16px] font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
              style={{ background: "#d4af37", color: "#241a02" }}
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[14px]" style={{ color: "#a7b2c3" }}>
          <Link href="/login" className="font-bold text-gold hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
