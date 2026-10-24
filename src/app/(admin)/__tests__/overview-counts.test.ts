import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H5: inbox counts come from one grouped RPC instead of three
 * unbounded row fetches — and when the RPC is not deployed yet (migration
 * 0015), the old row fetches run as a fallback so the inbox never breaks.
 * The stub counts from() calls per table to prove which path ran.
 */

import { ADMIN_ROW, chainable, getUser, session } from "./mocks";

let rpcResult: unknown = { data: [], error: null };
const queues: Record<string, unknown[]> = {};
const callCounts: Record<string, number> = {};

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async () => rpcResult,
    from: (table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;
      if (table === "admin_users") {
        return chainable({ data: ADMIN_ROW, error: null });
      }
      return chainable(pop(table));
    },
  }),
}));

import { getInboxOverview } from "../_actions";

const PLAYER = {
  id: "p1",
  display_name: "Ali",
  email: "a@x",
  avatar_url: null,
  is_online: true,
  created_at: "2026-10-24T00:00:00Z",
};

function baseSetup() {
  queues["players"] = [
    { data: [PLAYER], error: null },
    { data: [{ id: "p1", last_seen_at: new Date().toISOString() }], error: null },
  ];
  queues["player_tags"] = [{ data: [], error: null }];
  queues["chat_messages"] = [{ data: [], error: null }];
  queues["deposits"] = [];
  queues["game_accounts"] = [];
  for (const k of Object.keys(callCounts)) delete callCounts[k];
}

describe("getInboxOverview counts (audit H5)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    baseSetup();
  });

  it("uses the RPC counts and never fetches unread rows", async () => {
    rpcResult = {
      data: [
        { player_id: "p1", unread_count: 3, pending_count: 1, creating_count: 2 },
      ],
      error: null,
    };
    const [row] = await getInboxOverview();
    expect(row.unreadCount).toBe(3);
    expect(row.pendingDeposits).toBe(1);
    expect(row.creatingAccounts).toBe(2);
    // chat_messages was called only for the recent-messages window.
    expect(callCounts["chat_messages"]).toBe(1);
    expect(callCounts["deposits"]).toBeUndefined();
    expect(callCounts["game_accounts"]).toBeUndefined();
  });

  it("falls back to row fetches when the RPC is not deployed yet", async () => {
    rpcResult = { data: null, error: { message: "function not found" } };
    queues["chat_messages"] = [
      { data: [], error: null }, // recent window
      { data: [{ player_id: "p1" }, { player_id: "p1" }], error: null }, // unread
    ];
    queues["deposits"] = [{ data: [{ player_id: "p1" }], error: null }];
    queues["game_accounts"] = [{ data: [], error: null }];
    const [row] = await getInboxOverview();
    expect(row.unreadCount).toBe(2);
    expect(row.pendingDeposits).toBe(1);
    expect(row.creatingAccounts).toBe(0);
    expect(callCounts["chat_messages"]).toBe(2);
  });
});
