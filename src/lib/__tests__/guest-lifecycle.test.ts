import { describe, expect, it } from "vitest";

import {
  GUEST_TTL_MS,
  isGuestExpired,
  isGuestHiddenFromInbox,
} from "../guest-lifecycle";

const NOW = new Date("2026-10-25T12:00:00Z").getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("guest lifecycle (migration 0031)", () => {
  it("never hides or expires a registered player", () => {
    const row = {
      email: "bilal@gmail.com",
      guestLeftAt: iso(NOW - 30 * 24 * HOUR),
      lastSeenAt: iso(NOW - 30 * 24 * HOUR),
      createdAt: iso(NOW - 30 * 24 * HOUR),
    };
    expect(isGuestHiddenFromInbox(row, NOW)).toBe(false);
    expect(isGuestExpired(row, NOW)).toBe(false);
  });

  it("hides a logged-out guest immediately but only expires after 24h", () => {
    const row = {
      email: null,
      guestLeftAt: iso(NOW - 2 * HOUR),
      lastSeenAt: iso(NOW - 2 * HOUR),
      createdAt: iso(NOW - 2 * HOUR),
    };
    expect(isGuestHiddenFromInbox(row, NOW)).toBe(true);
    expect(isGuestExpired(row, NOW)).toBe(false);
    const old = { ...row, guestLeftAt: iso(NOW - GUEST_TTL_MS - 1) };
    expect(isGuestExpired(old, NOW)).toBe(true);
  });

  it("hides and expires an idle guest after 24h, not before", () => {
    const base = {
      email: null,
      guestLeftAt: null,
      lastSeenAt: iso(NOW - 23 * HOUR),
      createdAt: iso(NOW - 30 * HOUR),
    };
    expect(isGuestHiddenFromInbox(base, NOW)).toBe(false);
    expect(isGuestExpired(base, NOW)).toBe(false);
    const idle = { ...base, lastSeenAt: iso(NOW - 25 * HOUR) };
    expect(isGuestHiddenFromInbox(idle, NOW)).toBe(true);
    expect(isGuestExpired(idle, NOW)).toBe(true);
  });

  it("falls back to createdAt when presence never stamped", () => {
    const row = {
      email: null,
      guestLeftAt: null,
      lastSeenAt: null,
      createdAt: iso(NOW - 25 * HOUR),
    };
    expect(isGuestHiddenFromInbox(row, NOW)).toBe(true);
    expect(isGuestExpired(row, NOW)).toBe(true);
  });
});
