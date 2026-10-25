/** Offers ticker helpers (pure, unit-tested).
 *
 * The ticker shows every ACTIVE offer, in the admin's order
 * (sort_order, then oldest first), looping one after another. The
 * player layout hides the whole ticker when the global switch is off
 * or when no active offer exists — even a single offer loops on its
 * own, slowly, until the admin turns it off or deletes it. */

export interface TickerOffer {
  id: string;
  text: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** Active offers only, in display order. Inactive rows never reach
 *  any player's screen, and the order is stable for equal sort keys. */
export function visibleOffers(offers: TickerOffer[]): TickerOffer[] {
  return offers
    .filter((o) => o.is_active)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
}

/** Loop duration for the ticker animation: slow on purpose (news
 *  ticker pace), growing with the offer count so a long list never
 *  rushes past. Seconds. */
export function tickerDurationSeconds(count: number, perOffer: number): number {
  return Math.max(count * perOffer, perOffer * 2);
}
