import { describe, expect, it } from "vitest";

import {
  isLiveOffer,
  tickerDurationSeconds,
  visibleOffers,
  type TickerOffer,
} from "../offers";

const NOW = new Date("2026-10-25T12:00:00.000Z").getTime();

function offer(
  partial: Partial<TickerOffer> & { id: string },
): TickerOffer {
  return {
    text: "Offer",
    is_active: true,
    sort_order: 0,
    created_at: "2026-10-25T00:00:00.000Z",
    ...partial,
  };
}

describe("isLiveOffer", () => {
  it("keeps active offers without an expiry", () => {
    expect(isLiveOffer(offer({ id: "a" }), NOW)).toBe(true);
  });

  it("keeps active offers whose expiry is in the future", () => {
    expect(
      isLiveOffer(
        offer({ id: "a", expires_at: "2026-10-25T12:10:00.000Z" }),
        NOW,
      ),
    ).toBe(true);
  });

  it("drops expired offers even when still active", () => {
    expect(
      isLiveOffer(
        offer({ id: "a", expires_at: "2026-10-25T11:59:59.000Z" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("drops paused offers even with a future expiry", () => {
    expect(
      isLiveOffer(
        offer({
          id: "a",
          is_active: false,
          expires_at: "2026-10-25T13:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("visibleOffers", () => {
  it("drops inactive offers", () => {
    const rows = [
      offer({ id: "a", text: "On" }),
      offer({ id: "b", text: "Off", is_active: false }),
    ];
    expect(visibleOffers(rows, NOW).map((o) => o.id)).toEqual(["a"]);
  });

  it("drops expired offers", () => {
    const rows = [
      offer({ id: "a", text: "Live" }),
      offer({
        id: "b",
        text: "Gone",
        expires_at: "2026-10-25T11:00:00.000Z",
      }),
    ];
    expect(visibleOffers(rows, NOW).map((o) => o.id)).toEqual(["a"]);
  });

  it("sorts by sort_order, then oldest first", () => {
    const rows = [
      offer({ id: "late", sort_order: 2 }),
      offer({
        id: "old",
        sort_order: 1,
        created_at: "2026-10-25T00:00:00.000Z",
      }),
      offer({
        id: "new",
        sort_order: 1,
        created_at: "2026-10-25T01:00:00.000Z",
      }),
    ];
    expect(visibleOffers(rows, NOW).map((o) => o.id)).toEqual([
      "old",
      "new",
      "late",
    ]);
  });

  it("returns an empty list when nothing is live", () => {
    expect(
      visibleOffers([offer({ id: "a", is_active: false })], NOW),
    ).toEqual([]);
  });
});

describe("tickerDurationSeconds", () => {
  it("grows with the offer count but never rushes a short list", () => {
    expect(tickerDurationSeconds(1, 7)).toBe(14);
    expect(tickerDurationSeconds(5, 7)).toBe(35);
  });
});
