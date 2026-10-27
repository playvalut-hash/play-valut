import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Returning inbox chip with a visit count ("Returning ×N"): the count
 * comes from the guest's device row (migration 0031 guest_devices),
 * looked up via the player's guest_device_key. A missing device row
 * (or a failed device lookup) must not break the chip — it falls back
 * to plain "Returning" with no count.
 */

import { ADMIN_ROW, chainable, getUser, session } from "./mocks";

const rpcByName: Record<string, unknown> = {};
const queues: Record<string, unknown[]> = {};

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (name: string) =>
      rpcByName[name] ?? { data: [], error: null },
    from: (table: string) => {
      if (table === "admin_users") {
        return chainable({ data: ADMIN_ROW, error: null });
      }
      return chainable(pop(table));
    },
  }),
}));

import { getInboxOverview } from "../_actions";

const NOW = new Date().toISOString();

function seedGuest(lifecycle: Record<string, unknown>) {
  // players queries run in this order: sweep, list, last-seen, lifecycle.
  queues["players"] = [
    {
      data: [
        {
          id: "g1",
          email: null,
          guest_left_at: null,
          last_seen_at: NOW,
          created_at: NOW,
        },
      ],
      error: null,
    }, // sweep (not expired: left null, seen now)
    {
      data: [
        {
          id: "g1",
          display_name: "Guest-ab12",
          email: null,
          avatar_url: null,
          is_online: true,
          created_at: NOW,
        },
      ],
      error: null,
    }, // list
    { data: [{ id: "g1", last_seen_at: NOW }], error: null }, // last-seen
    { data: [lifecycle], error: null }, // lifecycle
  ];
  queues["player_tags"] = [{ data: [], error: null }];
  queues["chat_messages"] = [];
  queues["deposits"] = [];
  queues["game_accounts"] = [];
}

describe("getInboxOverview returning visits", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
    for (const k of Object.keys(rpcByName)) delete rpcByName[k];
  });

  it("shows the device visit count on a returning guest", async () => {
    seedGuest({
      id: "g1",
      guest_left_at: null,
      returning_guest: true,
      guest_device_key: "dev-1",
    });
    queues["guest_devices"] = [
      { data: [{ device_key: "dev-1", visit_count: 3 }], error: null },
    ];
    const [row] = await getInboxOverview();
    expect(row.returningGuest).toBe(true);
    expect(row.returningVisits).toBe(3);
  });

  it("falls back to no count when the device row is missing", async () => {
    seedGuest({
      id: "g1",
      guest_left_at: null,
      returning_guest: true,
      guest_device_key: "dev-missing",
    });
    queues["guest_devices"] = [{ data: [], error: null }];
    const [row] = await getInboxOverview();
    expect(row.returningGuest).toBe(true);
    expect(row.returningVisits).toBeNull();
  });

  it("still reports the count for a first-time guest (chip gates on the flag)", async () => {
    seedGuest({
      id: "g1",
      guest_left_at: null,
      returning_guest: false,
      guest_device_key: "dev-1",
    });
    queues["guest_devices"] = [
      { data: [{ device_key: "dev-1", visit_count: 1 }], error: null },
    ];
    const [row] = await getInboxOverview();
    expect(row.returningGuest).toBe(false);
    expect(row.returningVisits).toBe(1);
  });
});
