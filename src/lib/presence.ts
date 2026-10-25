/**
 * Player presence (v2 Phase 4): a player counts as online when their
 * heartbeat flag is set AND their last heartbeat is inside the window.
 * A missing last_seen (pre-migration-0013 rows) does not force offline.
 * Moved here from admin _actions so it can be unit-tested — the
 * _actions file is "use server", where an export becomes an action.
 */
export const ONLINE_WINDOW_MS = 75_000;

export function computeOnline(
  isOnline: boolean,
  lastSeen: string | null | undefined,
): boolean {
  if (!isOnline) return false;
  if (!lastSeen) return true;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}
