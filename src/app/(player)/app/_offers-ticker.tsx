"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  getTickerSnapshot,
  subscribeTicker,
  type LiveTickerOffer,
  type TickerState,
} from "./_ticker-store";

/** Offers ticker — live, no page reload, one offer at a time.
 *
 * - Mobile: a top bar, one offer sliding right-to-left, news-ticker
 *   style — it enters fully off the right end and leaves fully off
 *   the left end, slowly and smoothly, then the next offer follows.
 *   It stays pinned (under the app header) while the page scrolls,
 *   including above the support chat.
 * - Desktop: a right rail, a touch narrower than the left sidebar,
 *   one offer rising bottom-to-top like a live comment — it enters
 *   fully below the rail and disappears fully above it.
 *
 * The old doubled-track loop showed a single offer as two identical
 * cards at once; this stream never duplicates: the item (and its
 * animation key) swaps when each crossing ends, cycling through live
 * offers. A lone offer simply comes around again after a gap.
 *
 * Both pieces stay mounted (returning null while hidden) and follow
 * the live store, so an added offer appears instantly, a
 * paused/deleted/expired offer vanishes instantly, and the on/off
 * switch hides the whole ticker instantly — the player never reloads.
 * Hovering pauses the crossing. Tapping an offer opens support chat. */

function useLiveTicker(initial: TickerState): TickerState {
  const [state, setState] = useState(initial);
  useEffect(
    () => subscribeTicker(() => setState(getTickerSnapshot())),
    [],
  );
  return state;
}

/** Cycles through live offers, one crossing at a time. The position
 *  wraps with modulo, so a deleted offer is replaced instantly by
 *  whatever now sits at that position — no stale card lingers until
 *  its crossing would have ended. The cycle counter forces a fresh
 *  animation even when the same lone offer comes around again. */
function useTickerCycle(offers: LiveTickerOffer[]) {
  const [pos, setPos] = useState(0);
  const [cycle, setCycle] = useState(0);
  const current =
    offers.length === 0 ? null : offers[pos % offers.length];
  const advance = () => {
    setPos((p) => p + 1);
    setCycle((c) => c + 1);
  };
  return { current, cycle, advance };
}

/** One crossing of the stream. It is keyed by the offer list above,
 *  so any real list change (add/remove) remounts it and restarts the
 *  cycle from the first offer instantly — a new order-0 offer does
 *  not wait out the previous crossing. */
function MobileStream({ offers }: { offers: LiveTickerOffer[] }) {
  const { current, cycle, advance } = useTickerCycle(offers);
  if (!current) return null;
  return (
    <Link
      key={`${current.id}-${cycle}`}
      href="/app/chat"
      onAnimationEnd={advance}
      className="pv-ticker-item-x absolute left-0 top-1/2 whitespace-nowrap text-[13px] font-bold text-gold hover:[animation-play-state:paused]"
      style={{ animationDuration: "16s" }}
    >
      ✦ {current.text}
    </Link>
  );
}

function DesktopStream({ offers }: { offers: LiveTickerOffer[] }) {
  const { current, cycle, advance } = useTickerCycle(offers);
  if (!current) return null;
  return (
    <Link
      key={`${current.id}-${cycle}`}
      href="/app/chat"
      onAnimationEnd={advance}
      className="pv-ticker-item-y absolute inset-x-3 rounded-xl border border-gold/30 bg-surface-card px-3 py-2.5 text-[13px] font-bold leading-snug text-text-primary transition-colors hover:border-gold/60 hover:[animation-play-state:paused]"
      style={{ animationDuration: "10s" }}
    >
      {current.text}
    </Link>
  );
}

export function MobileOffersTicker({ initial }: { initial: TickerState }) {
  const { enabled, offers } = useLiveTicker(initial);
  if (!enabled || offers.length === 0) return null;
  return (
    <div
      aria-label="Offers"
      className="relative sticky top-0 z-40 h-10 shrink-0 overflow-hidden border-b border-gold/30 bg-navy md:hidden"
    >
      <MobileStream key={offers.map((o) => o.id).join(",")} offers={offers} />
    </div>
  );
}

export function DesktopOffersRail({ initial }: { initial: TickerState }) {
  const { enabled, offers } = useLiveTicker(initial);
  if (!enabled || offers.length === 0) return null;
  return (
    <aside
      aria-label="Offers"
      className="hidden w-[clamp(170px,14vw,220px)] shrink-0 flex-col border-l border-line bg-bg md:sticky md:top-0 md:flex md:h-dvh"
    >
      <h2 className="shrink-0 px-3 pb-2 pt-4 text-xs font-extrabold uppercase tracking-wider text-gold">
        Offers
      </h2>
      <div className="relative min-h-0 flex-1 overflow-hidden px-3 pb-4">
        <DesktopStream
          key={offers.map((o) => o.id).join(",")}
          offers={offers}
        />
      </div>
    </aside>
  );
}
