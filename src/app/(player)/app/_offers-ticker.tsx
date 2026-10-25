import { tickerDurationSeconds } from "@/lib/offers";

/** Offers ticker — pure CSS animation, no client JS.
 *
 * - Mobile: a top bar that scrolls right-to-left, news-ticker style.
 *   It sits above every player page (including the support chat) and
 *   stays pinned to the top while the page scrolls.
 * - Desktop: a right rail, a touch narrower than the left sidebar,
 *   whose offers stream bottom-to-top like live comments.
 *
 * The list is rendered twice so the loop restarts invisibly; hovering
 * pauses either track. A single offer loops on its own, slowly, until
 * the admin turns the ticker off or deletes it. */

export function MobileOffersTicker({ offers }: { offers: string[] }) {
  return (
    <div
      aria-label="Offers"
      className="sticky top-0 z-40 flex h-10 shrink-0 items-center overflow-hidden border-b border-gold/30 bg-navy md:hidden"
    >
      <div
        className="pv-ticker-x flex w-max items-center gap-10 pr-10 hover:[animation-play-state:paused]"
        style={{
          animationDuration: `${tickerDurationSeconds(offers.length, 8)}s`,
        }}
      >
        {[...offers, ...offers].map((text, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-[13px] font-bold text-gold"
          >
            ✦ {text}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DesktopOffersRail({ offers }: { offers: string[] }) {
  return (
    <aside
      aria-label="Offers"
      className="hidden w-[clamp(170px,14vw,220px)] shrink-0 flex-col border-l border-line bg-bg md:sticky md:top-0 md:flex md:h-dvh"
    >
      <h2 className="shrink-0 px-3 pb-2 pt-4 text-xs font-extrabold uppercase tracking-wider text-gold">
        Offers
      </h2>
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-4">
        <div
          className="pv-ticker-y flex flex-col gap-3 hover:[animation-play-state:paused]"
          style={{
            animationDuration: `${tickerDurationSeconds(offers.length, 7)}s`,
          }}
        >
          {[...offers, ...offers].map((text, i) => (
            <p
              key={i}
              className="rounded-xl border border-gold/30 bg-surface-card px-3 py-2.5 text-[13px] font-bold leading-snug text-text-primary"
            >
              {text}
            </p>
          ))}
        </div>
      </div>
    </aside>
  );
}
