"use client";

import { useEffect } from "react";

import { getTickerState } from "./_actions";
import {
  getTickerSnapshot,
  setTickerState,
  subscribeTicker,
  type LiveTickerOffer,
} from "./_ticker-store";

/** Always-mounted live ticker engine (renders nothing itself).
 *
 * It keeps every open player page in sync with the admin's offers
 * WITHOUT a page reload:
 * - Supabase Realtime on offers + offer_settings: any add, edit,
 *   pause, delete or switch flip refetches the ticker state and
 *   broadcasts it to the bar and rail instantly.
 * - A 30s safety poll + a refetch when the tab becomes visible again
 *   cover a missing publication or a dropped event.
 * - A 10s sweep drops offers the moment their expiry passes, so an
 *   ending offer vanishes on its own — no reload, no server round
 *   trip needed for that step.
 * - It also keeps the chat's mobile height variable honest as the
 *   ticker appears and disappears live.
 *
 * Fresh server state on navigation wins over live state (the layout
 * re-fetches on every navigation, so it is at least as fresh). */
export default function TickerSync({
  initialEnabled,
  initialOffers,
}: {
  initialEnabled: boolean;
  initialOffers: LiveTickerOffer[];
}) {
  // Fresh server state on navigation (layout re-fetch) wins.
  useEffect(() => {
    setTickerState({ enabled: initialEnabled, offers: initialOffers });
  }, [initialEnabled, initialOffers]);

  // Live engine: realtime + poll + visibility + expiry sweep.
  useEffect(() => {
    let stopped = false;
    let channel: { unsubscribe: () => void } | null = null;

    async function refetch() {
      try {
        const next = await getTickerState();
        if (!stopped) setTickerState(next);
      } catch {
        // keep the current ticker on transient errors
      }
    }

    async function setup() {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const onEvent = () => {
          void refetch();
        };
        channel = supabase
          .channel("offers-ticker")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "offers" },
            onEvent,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "offer_settings" },
            onEvent,
          )
          .subscribe() as unknown as { unsubscribe: () => void };
      } catch {
        // realtime unavailable — poll + visibility still cover
      }
    }
    void setup();

    const poll = setInterval(() => {
      void refetch();
    }, 30000);
    const sweep = setInterval(() => {
      const cur = getTickerSnapshot();
      const now = Date.now();
      const kept = cur.offers.filter(
        (o) => !o.expiresAt || new Date(o.expiresAt).getTime() > now,
      );
      if (kept.length !== cur.offers.length) {
        setTickerState({ enabled: cur.enabled, offers: kept });
      }
    }, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      channel?.unsubscribe();
      clearInterval(poll);
      clearInterval(sweep);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Chat height variable: the chat root subtracts --pv-ticker-h, and
  // the layout only sets its server-time value — this keeps it true
  // as the ticker appears and disappears live.
  useEffect(() => {
    const apply = () => {
      const s = getTickerSnapshot();
      const value = s.enabled && s.offers.length > 0 ? "2.5rem" : "0px";
      const shell = document.getElementById("pv-player-shell");
      if (shell) shell.style.setProperty("--pv-ticker-h", value);
      else document.documentElement.style.setProperty("--pv-ticker-h", value);
    };
    apply();
    return subscribeTicker(apply);
  }, []);

  return null;
}
