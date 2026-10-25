"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  isActivateOpen,
  setActivateOpen,
  subscribeActivate,
} from "./_guest-activate-store";

/** Guest banner + activate sheet. Shows ONLY for anonymous (guest)
 *  sessions. The guest's chat, accounts and deposits already live
 *  under their anonymous user id — activation CONVERTS that same user
 *  (it never creates a second account), so nothing is lost: Google
 *  linkIdentity converts the anonymous user to a Google user with
 *  the same id; the callback lands back on /app.
 *  Activation is Google-only (owner direction, same as the removed
 *  email registration): no email/password form lives here anymore.
 *  The sheet's open state is shared through _guest-activate-store so
 *  the persistent sidebar / drawer "Activate account" entry opens
 *  this same sheet. Until anonymous sign-ins are enabled in Supabase
 *  this banner never appears, because no anonymous session can
 *  exist. */
export default function GuestBanner({
  guestModeEnabled,
}: {
  /** Site-wide guest switch (migration 0029): when false, new guest
   *  entry is hidden elsewhere, but THIS banner stays — existing
   *  guests are pushed to activate, never kicked out. */
  guestModeEnabled: boolean;
}) {
  const [isGuest, setIsGuest] = useState(false);
  const [open, setOpenState] = useState(isActivateOpen());
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (on) setIsGuest(data.user?.is_anonymous === true);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  useEffect(
    () => subscribeActivate(() => setOpenState(isActivateOpen())),
    [],
  );

  // Admin-sent activation links land here: /app?activate=1 opens the
  // sheet on its own, then the param is dropped so a refresh doesn't
  // pop it again. (A registered player landing here sees nothing —
  // the banner only renders for guests.)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("activate") === "1") {
        setActivateOpen(true);
        params.delete("activate");
        const next = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${next ? `?${next}` : ""}`,
        );
      }
    } catch {
      // Odd URL — the sidebar entry still opens the sheet by hand.
    }
  }, []);

  if (!isGuest) return null;

  async function handleGoogle() {
    setNotice(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setNotice("Google sign-in isn't set up yet — please try again.");
      }
      // On success the browser leaves for Google; the callback brings
      // the same (now linked) user back to /app.
    } catch {
      setNotice("Google sign-in isn't set up yet — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Sticky + solid gold: it used to scroll away at the top, so
          guests lost it. Mobile sticks below the sticky offers
          ticker (the --pv-ticker-h offset, 0 when no ticker);
          desktop sticks straight to the viewport top. */}
      <div className="sticky top-[var(--pv-ticker-h)] z-30 mb-3 flex flex-col gap-2 rounded-xl border border-[#d4af37] bg-[#d4af37] px-4 py-3 shadow-[0_4px_20px_rgba(212,175,55,0.35)] sm:flex-row sm:items-center sm:justify-between md:top-0">
        <p className="text-sm font-bold leading-relaxed text-[#241a02]">
          {guestModeEnabled
            ? "You're chatting as a guest — your chat is saved here. Activate your account to keep it."
            : "Guest mode is turned off — activate now to keep your chat, games and deposits."}
        </p>
        <button
          type="button"
          onClick={() => setActivateOpen(true)}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition hover:brightness-110"
          style={{ background: "#0b0e14", color: "#d4af37" }}
        >
          Activate account
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setActivateOpen(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-2xl border border-[#232c3e] bg-[#151a26] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Keep your chat</h2>
              <button
                type="button"
                onClick={() => setActivateOpen(false)}
                className="px-2 py-1 text-xl leading-none text-[#6d7a8f]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-[#a7b2c3]">
              Activating converts this guest session into your real
              account — your chat, games and deposits stay exactly where
              they are. Nothing is lost.
            </p>

            {notice ? (
              <div className="mt-4 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-4 py-3 text-sm text-[#d4af37]">
                {notice}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border py-3.5 text-[15px] font-semibold transition hover:border-[#d4af37]/50 disabled:opacity-60"
              style={{ borderColor: "#232c3e", background: "#0b0e14", color: "#eef2f7" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" role="img" aria-label="Google">
                <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z" />
                <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
              </svg>
              Continue with Google
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
