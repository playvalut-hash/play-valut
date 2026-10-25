"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** New-password form for reset links. On mount it turns the visit
 *  into a session: a ?code= (PKCE, the current default) is exchanged,
 *  otherwise an existing session from the URL hash is picked up.
 *  A used/expired link lands on the error state with a path back to
 *  /forgot. The code is scrubbed from the URL after a good exchange
 *  so a refresh can't re-exchange it. */
export default function ResetForm() {
  const router = useRouter();
  const ranRef = useRef(false);
  const [phase, setPhase] = useState<"checking" | "ready" | "error" | "done">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try {
        const supabase = createClient();
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setPhase("error");
            return;
          }
          window.history.replaceState(null, "", "/reset-password");
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setPhase(session ? "ready" : "error");
      } catch {
        setPhase("error");
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Choose a password of at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError("Couldn't set the new password — try again.");
      } else {
        setPhase("done");
      }
    } catch {
      setError("Couldn't set the new password — try again.");
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
          Choose a new password
        </h1>

        {phase === "checking" ? (
          <p className="mt-6 text-center text-sm" style={{ color: "#a7b2c3" }}>
            Checking your reset link…
          </p>
        ) : null}

        {phase === "error" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-[#ff6b5e]/40 bg-[#ff6b5e]/10 px-4 py-3 text-sm leading-relaxed text-[#ff6b5e]">
              This reset link is invalid or expired. Request a fresh one
              and open it promptly.
            </div>
            <Link
              href="/forgot"
              className="block w-full rounded-2xl py-4 text-center text-[16px] font-bold transition hover:brightness-110"
              style={{ background: "#d4af37", color: "#241a02" }}
            >
              Request a new link
            </Link>
            <p className="text-center text-[14px]" style={{ color: "#a7b2c3" }}>
              <Link href="/login" className="font-bold text-gold hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : null}

        {phase === "ready" ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
            {error && (
              <div className="rounded-xl border border-[#ff6b5e]/40 bg-[#ff6b5e]/10 px-4 py-3 text-sm text-[#ff6b5e]">
                {error}
              </div>
            )}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              aria-label="New password"
              autoComplete="new-password"
              className="w-full rounded-2xl border px-4 py-3.5 text-[15px] outline-none placeholder:text-[#6d7a8f]"
              style={{ background: "#151a26", borderColor: "#232c3e", color: "#eef2f7" }}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              className="w-full rounded-2xl border px-4 py-3.5 text-[15px] outline-none placeholder:text-[#6d7a8f]"
              style={{ background: "#151a26", borderColor: "#232c3e", color: "#eef2f7" }}
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl py-4 text-[16px] font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
              style={{ background: "#d4af37", color: "#241a02" }}
            >
              {busy ? "Saving…" : "Set new password"}
            </button>
          </form>
        ) : null}

        {phase === "done" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-gold">
              Your password is set. You&apos;re signed in — continue to
              your lobby.
            </div>
            <button
              type="button"
              onClick={() => {
                router.push("/app");
                router.refresh();
              }}
              className="w-full rounded-2xl py-4 text-[16px] font-bold transition hover:brightness-110"
              style={{ background: "#d4af37", color: "#241a02" }}
            >
              Continue to the app
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
