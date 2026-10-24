import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H5: inbox counts come from one grouped RPC instead of three
 * unbounded row fetches — and when the RPC is not deployed yet (migration
 * 0015), the old row fetches run as a fallback so the inbox never breaks.
 * The stub counts from() calls per table to prove which path ran.
 */

import { ADMIN_ROW, chainable, getUser, session } from "./mocks";

const rpcByName: Record<string, unknown> = {};
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
    // Per-name results since M2 added a second RPC
    // (player_latest_messages); each test sets the names it needs.
    rpc: async (name: string) =>
      rpcByName[name] ?? { data: [], error: null },
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
  queues["chat_messages"] = [];
  queues["deposits"] = [];
  queues["game_accounts"] = [];
  for (const k of Object.keys(callCounts)) delete callCounts[k];
  for (const k of Object.keys(rpcByName)) delete rpcByName[k];
}

describe("getInboxOverview counts (audit H5)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    baseSetup();
  });

  it("uses the RPC counts and never fetches unread rows", async () => {
    rpcByName["player_overview_counts"] = {
      data: [
        { player_id: "p1", unread_count: 3, pending_count: 1, creating_count: 2 },
      ],
      error: null,
    };
    const [row] = await getInboxOverview();
    expect(row.unreadCount).toBe(3);
    expect(row.pendingDeposits).toBe(1);
    expect(row.creatingAccounts).toBe(2);
    // M2: no chat_messages query ran at all — previews come from the
    // latest-messages RPC, not the old shared window.
    expect(callCounts["chat_messages"]).toBeUndefined();
    expect(callCounts["deposits"]).toBeUndefined();
    expect(callCounts["game_accounts"]).toBeUndefined();
  });

  it("falls back to row fetches when the RPC is not deployed yet", async () => {
    // Pre-migration state: NEITHER function exists yet, so both RPCs
    // fall back (counts to row fetches, previews to the shared window).
    rpcByName["player_overview_counts"] = {
      data: null,
      error: { message: "function not found" },
    };
    rpcByName["player_latest_messages"] = {
      data: null,
      error: { message: "function not found" },
    };
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
