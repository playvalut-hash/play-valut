"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  getTickerSnapshot,
  subscribeTicker,
  type LiveTickerOffer,
  type TickerState,
} from "./_ticker-store";

/** Offers ticker — live, no page reload.
 *
 * - Mobile: a top bar with a measured conveyor (see below), offers
 *   sliding right-to-left, news-ticker style, pinned at the very top
 *   while the page scrolls, including above the support chat.
 * - Desktop: a right rail, a touch narrower than the left sidebar,
 *   one offer rising bottom-to-top like a live comment — it enters
 *   fully below the rail and disappears fully above it.
 *
 * Both pieces stay mounted (returning null while hidden) and follow
 * the live store, so an added offer appears instantly, a
 * paused/deleted/expired offer vanishes instantly, and the on/off
 * switch hides the whole ticker instantly — the player never reloads.
 * Hovering pauses a crossing. Tapping an offer opens support chat. */

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

/** Mobile ticker: a measured conveyor, not a blind loop.
 *
 * Two slots take turns crossing the bar. Each slot measures its own
 * text width (and the bar's width) before it starts, then runs at a
 * constant ~30px/s — so a long offer gets a proportionally longer
 * crossing (its length sets its time; it never rushes, and it never
 * overwrites the next offer). The next slot starts exactly when the
 * current one's tail clears the right edge (delay = current width /
 * speed), so the next offer is already entering as the current one
 * leaves: the screen is never empty, and the two never collide,
 * however long the text is. With a single offer the two slots carry
 * the same text, staggered — a continuous flow, not a duplicated
 * list. The list key above remounts the whole conveyor on any real
 * list change, restarting it from the first offer instantly. */

const TICKER_SPEED_PX_S = 30;

interface ConveyorSlotState {
  offer: LiveTickerOffer;
  round: number;
  /** Seconds before this run starts (tail-clear stagger). */
  delay: number;
  /** Measured text width, once laid out. */
  width: number | null;
  /** Seconds for this run, once measured. */
  duration: number | null;
}

function ConveyorSlot({
  slot,
  onMeasured,
  onEnd,
}: {
  slot: ConveyorSlotState;
  onMeasured: (width: number, barWidth: number) => void;
  onEnd: () => void;
}) {
  // Measure-then-animate: the slot first lays out hidden (no animation
  // class, so no instant 0s run firing animationEnd), reports its
  // width via a callback ref, and only then animates with its measured
  // duration. The ref guard skips re-measuring after the width lands.
  const measureRef = useCallback(
    (el: HTMLAnchorElement | null) => {
      if (!el || slot.width !== null) return;
      const barWidth =
        (el.offsetParent as HTMLElement | null)?.clientWidth ??
        window.innerWidth;
      onMeasured(el.offsetWidth, barWidth);
    },
    [slot.width, onMeasured],
  );
  const animated = slot.width !== null && slot.duration !== null;
  return (
    <Link
      ref={measureRef}
      href="/app/chat"
      onAnimationEnd={animated ? onEnd : undefined}
      className={
        animated
          ? "pv-ticker-item-x absolute left-0 top-1/2 whitespace-nowrap text-[13px] font-bold text-gold hover:[animation-play-state:paused]"
          : "invisible absolute left-0 top-1/2 whitespace-nowrap text-[13px] font-bold text-gold"
      }
      style={
        animated
          ? {
              animationDuration: `${slot.duration}s`,
              animationDelay: `${slot.delay}s`,
              animationFillMode: "backwards",
            }
          : undefined
      }
    >
      ✦ {slot.offer.text}
    </Link>
  );
}

function MobileConveyor({ offers }: { offers: LiveTickerOffer[] }) {
  const nextRef = useRef(1);
  const widthARef = useRef<number | null>(null);
  const widthBRef = useRef<number | null>(null);
  const [slotA, setSlotA] = useState<ConveyorSlotState>(() => ({
    offer: offers[0],
    round: 0,
    delay: 0,
    width: null,
    duration: null,
  }));
  const [slotB, setSlotB] = useState<ConveyorSlotState | null>(null);

  const onMeasuredA = useCallback(
    (width: number, barWidth: number) => {
      widthARef.current = width;
      setSlotA((s) =>
        s.width === null
          ? { ...s, width, duration: (barWidth + width) / TICKER_SPEED_PX_S }
          : s,
      );
      // The second slot joins once the first is measured, starting
      // when the first one's tail clears the right edge.
      setSlotB((b) =>
        b === null
          ? {
              offer: offers[nextRef.current % offers.length],
              round: 0,
              delay: width / TICKER_SPEED_PX_S,
              width: null,
              duration: null,
            }
          : b,
      );
      nextRef.current += 1;
    },
    [offers],
  );

  const onMeasuredB = useCallback((width: number, barWidth: number) => {
    widthBRef.current = width;
    setSlotB((s) =>
      s && s.width === null
        ? { ...s, width, duration: (barWidth + width) / TICKER_SPEED_PX_S }
        : s,
    );
  }, []);

  const onEndA = useCallback(() => {
    const offer = offers[nextRef.current % offers.length];
    nextRef.current += 1;
    setSlotA((s) => ({
      offer,
      round: s.round + 1,
      delay: (widthBRef.current ?? 0) / TICKER_SPEED_PX_S,
      width: null,
      duration: null,
    }));
  }, [offers]);

  const onEndB = useCallback(() => {
    const offer = offers[nextRef.current % offers.length];
    nextRef.current += 1;
    setSlotB((s) =>
      s === null
        ? s
        : {
            offer,
            round: s.round + 1,
            delay: (widthARef.current ?? 0) / TICKER_SPEED_PX_S,
            width: null,
            duration: null,
          },
    );
  }, [offers]);

  return (
    <>
      <ConveyorSlot
        key={`a-${slotA.round}`}
        slot={slotA}
        onMeasured={onMeasuredA}
        onEnd={onEndA}
      />
      {slotB && (
        <ConveyorSlot
          key={`b-${slotB.round}`}
          slot={slotB}
          onMeasured={onMeasuredB}
          onEnd={onEndB}
        />
      )}
    </>
  );
}

/** One crossing of the stream. It is keyed by the offer list above,
 *  so any real list change (add/remove) remounts it and restarts the
 *  cycle from the first offer instantly — a new order-0 offer does
 *  not wait out the previous crossing. */
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
      <MobileConveyor
        key={offers.map((o) => o.id).join(",")}
        offers={offers}
      />
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
