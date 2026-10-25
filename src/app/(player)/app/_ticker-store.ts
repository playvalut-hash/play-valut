/** Live ticker store (client-side, plain module).
 *
 * The player layout renders the ticker pieces unconditionally (they
 * return null while hidden), so they stay subscribed even when the
 * ticker is off or empty — that is what makes the ticker instant: the
 * sync engine below broadcasts every change, and a hidden bar/rail
 * appears the moment an offer goes live, with no page reload. State
 * is replaced, never mutated, and identical broadcasts are skipped
 * so the 30s safety poll never restarts the animation. */

export interface LiveTickerOffer {
  id: string;
  text: string;
  expiresAt: string | null;
}

export interface TickerState {
  enabled: boolean;
  offers: LiveTickerOffer[];
}

let state: TickerState = { enabled: false, offers: [] };
const listeners = new Set<() => void>();

export function getTickerSnapshot(): TickerState {
  return state;
}

export function subscribeTicker(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function sameTicker(a: TickerState, b: TickerState): boolean {
  if (a.enabled !== b.enabled || a.offers.length !== b.offers.length) {
    return false;
  }
  return a.offers.every(
    (o, i) =>
      o.id === b.offers[i].id &&
      o.text === b.offers[i].text &&
      o.expiresAt === b.offers[i].expiresAt,
  );
}

export function setTickerState(next: TickerState): void {
  if (sameTicker(state, next)) return;
  state = next;
  for (const fn of [...listeners]) fn();
}
