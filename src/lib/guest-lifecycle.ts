/** Guest lifecycle (migration 0031): when does an unactivated guest
 *  disappear from the admin site and the database?
 *
 *  A guest is "gone" when they logged out (guest_left_at set) OR when
 *  they have been idle for a full day — last_seen_at is stamped by the
 *  presence heartbeat every 25s while the app is open, so 24h without a
 *  stamp means the tab is closed. Registered players (email set) are
 *  NEVER expired by this rule, and neither are guests who activated.
 *  The sweep itself only DELETES the gone-for-24h ones; a merely
 *  logged-out guest is hidden from the inbox immediately but their
 *  rows survive until the 24h mark (so a same-day return still has a
 *  thread to come back to — under a new guest session it shows as a
 *  fresh thread with the Returning marker instead).
 */

export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

export interface GuestExpiryInput {
  /** Null email = unactivated guest; set email = registered player. */
  email: string | null;
  /** Set the moment the guest explicitly logged out. */
  guestLeftAt: string | null;
  /** Last presence stamp; null when presence never ran. */
  lastSeenAt: string | null;
  /** Fallback activity signal when lastSeenAt is null. */
  createdAt: string;
}

/** True when this row should be hidden from the admin inbox. */
export function isGuestHiddenFromInbox(
  row: GuestExpiryInput,
  nowMs: number = Date.now(),
): boolean {
  if (row.email !== null) return false;
  if (row.guestLeftAt !== null) return true;
  const last = row.lastSeenAt ?? row.createdAt;
  return nowMs - new Date(last).getTime() >= GUEST_TTL_MS;
}

/** True when this row's database rows should be deleted by the sweep. */
export function isGuestExpired(
  row: GuestExpiryInput,
  nowMs: number = Date.now(),
): boolean {
  if (row.email !== null) return false;
  if (row.guestLeftAt !== null) {
    return nowMs - new Date(row.guestLeftAt).getTime() >= GUEST_TTL_MS;
  }
  const last = row.lastSeenAt ?? row.createdAt;
  return nowMs - new Date(last).getTime() >= GUEST_TTL_MS;
}
