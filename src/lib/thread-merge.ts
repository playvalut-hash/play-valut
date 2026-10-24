/**
 * Merge a freshly fetched latest-N window into a thread list that may
 * already hold older pages (v2 Phase 2, audit M3).
 *
 * The live refresh replaces the window every poll, which would wipe
 * pages the user loaded with "Load older" — so when older pages are
 * loaded, the refresh merges instead of replacing:
 * - Fresh rows win on overlap (edits like card flips still land).
 * - Rows strictly older than the fresh window's oldest are kept — they
 *   are the loaded older pages (or messages pushed out of the window
 *   by new arrivals, which are still real history).
 * - Rows newer than the fresh window's oldest but missing from fresh
 *   are dropped — they were deleted server-side.
 * - When fresh is smaller than the window, the full history fits in
 *   it, so any kept older rows must be stale (e.g. after a chat
 *   clear) and the merge returns fresh alone.
 *
 * Both lists are ascending (oldest first). The createdAt accessor
 * exists because admin views use `createdAt` and player rows use
 * `created_at`. UUID text order equals byte order, so the id
 * tiebreaker matches Postgres ordering.
 */
export function mergeThreadMessages<T extends { id: string }>(
  prev: T[],
  fresh: T[],
  windowSize: number,
  createdAt: (m: T) => string,
): T[] {
  if (fresh.length < windowSize) return fresh;
  const freshIds = new Set(fresh.map((m) => m.id));
  const oldest = fresh[0];
  const oldestAt = createdAt(oldest);
  const kept = prev.filter((m) => {
    if (freshIds.has(m.id)) return false;
    const at = createdAt(m);
    return at < oldestAt || (at === oldestAt && m.id < oldest.id);
  });
  return [...kept, ...fresh];
}
