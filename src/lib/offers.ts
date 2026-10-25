/** Offers ticker helpers (pure, unit-tested).
 *
 * The ticker streams every LIVE offer, one at a time, in the admin's
 * order (sort_order, then oldest first) — never two copies at once.
 * Live means: active AND not expired. The player layout hides the
 * whole ticker when the global switch is off or when no live offer
 * exists. A lone offer simply comes around again after a gap, slowly,
 * until the admin turns it off, deletes it, pauses it, or its expiry
 * passes. Expiry is enforced in two places: the server filters expired
 * rows on every fetch, and the player's live ticker drops them the
 * moment they pass (no page reload on either side). */

export interface TickerOffer {
  id: string;
  text: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  expires_at?: string | null;
}

/** True while the offer belongs in the ticker right now. Expired rows
 *  stay in the admin list (with an Expired badge) so the admin can see
 *  and delete them, but they never reach a player. */
export function isLiveOffer(
  offer: TickerOffer,
  nowMs: number = Date.now(),
): boolean {
  if (!offer.is_active) return false;
  if (!offer.expires_at) return true;
  return new Date(offer.expires_at).getTime() > nowMs;
}

/** Live offers only, in display order. Inactive and expired rows never
 *  reach any player's screen, and the order is stable for equal keys. */
export function visibleOffers(
  offers: TickerOffer[],
  nowMs: number = Date.now(),
): TickerOffer[] {
  return offers
    .filter((o) => isLiveOffer(o, nowMs))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
}
