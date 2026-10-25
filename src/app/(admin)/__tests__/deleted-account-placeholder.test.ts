import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M15: a deleted game account must leave an explicit placeholder
 * in the thread — not a silent gap (admin) or a "Creating…" ghost card
 * that never resolves (player). The admin resolver marks the view with
 * the game name; the UI branches on it.
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

const METHODS = [
  "select",
  "eq",
  "neq",
  "in",
  "order",
  "limit",
  "single",
  "maybeSingle",
];

const queues: Record<string, unknown[]> = {};

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = () => q;
  }
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "admin_users") {
        return chain({ data: ADMIN_ROW, error: null });
      }
      return chain(pop(table));
    },
  }),
}));

import { getThread } from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";

function accountMessage(id: string, accountId: string) {
  return {
    id,
    player_id: PLAYER,
    sender: "system",
    kind: "account",
    body: { game_id: "juwa", account_id: accountId, status: "active" },
    created_at: "2026-01-01T00:00:00Z",
    is_read_by_player: false,
    is_read_by_admin: true,
  };
}

describe("deleted account placeholder (audit M15)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
    queues["games"] = [{ data: [{ id: "juwa", name: "Juwa" }], error: null }];
    queues["payment_methods"] = [{ data: [], error: null }];
  });

  it("marks a card whose row is gone with the game name", async () => {
    queues["chat_messages"] = [
      { data: [accountMessage("m1", "gone-acc")], error: null },
    ];
    queues["game_accounts"] = [{ data: [], error: null }];
    const views = await getThread(PLAYER);
    expect(views).toHaveLength(1);
    expect(views[0].account).toBeNull();
    expect(views[0].deletedGameName).toBe("Juwa");
  });

  it("leaves a live card untouched", async () => {
    queues["chat_messages"] = [
      { data: [accountMessage("m1", "live-acc")], error: null },
    ];
    queues["game_accounts"] = [
      {
        data: [
          {
            id: "live-acc",
            game_id: "juwa",
            username: "player1",
            status: "active",
          },
        ],
        error: null,
      },
    ];
    const views = await getThread(PLAYER);
    expect(views[0].account).toMatchObject({
      accountId: "live-acc",
      gameName: "Juwa",
      username: "player1",
    });
    expect(views[0].deletedGameName).toBeNull();
  });
});
