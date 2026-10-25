import { describe, expect, it } from "vitest";

import { ONLINE_WINDOW_MS, computeOnline } from "../presence";

/**
 * Audit Phase 4 (presence): the 75 s heartbeat window, including the
 * no-last-seen fallback for pre-migration-0013 rows.
 */
describe("computeOnline", () => {
  it("is offline when the flag is off, whatever the heartbeat", () => {
    expect(computeOnline(false, new Date().toISOString())).toBe(false);
    expect(computeOnline(false, null)).toBe(false);
  });

  it("is online with no last_seen (flag alone decides)", () => {
    expect(computeOnline(true, null)).toBe(true);
    expect(computeOnline(true, undefined)).toBe(true);
  });

  it("is online inside the window and offline past it", () => {
    const now = Date.now();
    expect(computeOnline(true, new Date(now - 10_000).toISOString())).toBe(true);
    expect(
      computeOnline(true, new Date(now - ONLINE_WINDOW_MS - 1000).toISOString()),
    ).toBe(false);
  });
});
