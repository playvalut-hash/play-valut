import { describe, expect, it } from "vitest";

import { tickerDurationSeconds, visibleOffers, type TickerOffer } from "../offers";

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

describe("visibleOffers", () => {
  it("drops inactive offers", () => {
    const rows = [
      offer({ id: "a", text: "On" }),
      offer({ id: "b", text: "Off", is_active: false }),
    ];
    expect(visibleOffers(rows).map((o) => o.id)).toEqual(["a"]);
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
    expect(visibleOffers(rows).map((o) => o.id)).toEqual([
      "old",
      "new",
      "late",
    ]);
  });

  it("returns an empty list when nothing is active", () => {
    expect(
      visibleOffers([offer({ id: "a", is_active: false })]),
    ).toEqual([]);
  });
});

describe("tickerDurationSeconds", () => {
  it("grows with the offer count but never rushes a short list", () => {
    expect(tickerDurationSeconds(1, 7)).toBe(14);
    expect(tickerDurationSeconds(5, 7)).toBe(35);
  });
});
