import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M14: getSheetLog used to stop at .limit(2000) with no sign
 * anything was missing. It must now page through every account, and
 * chunk the player/game lookups so a large export cannot blow past
 * PostgREST URL limits with one giant IN list.
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

const queues: Record<string, unknown[]> = {};
const calls: { table: string; method: string }[] = [];

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(table: string, result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "range", "in", "single", "maybeSingle"]) {
    q[m] = () => {
      calls.push({ table, method: m });
      return q;
    };
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
        return chain(table, { data: ADMIN_ROW, error: null });
      }
      return chain(table, pop(table));
    },
  }),
}));

import { getSheetLog } from "../_actions";

function accountRow(i: number, playerId: string) {
  return {
    id: `a-${i}`,
    username: `u${i}`,
    player_id: playerId,
    game_id: "g1",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("getSheetLog full export (audit M14)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
    calls.length = 0;
  });

  it("pages past 1,000 rows instead of truncating", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => accountRow(i, "p1"));
    const page2 = [accountRow(1000, "p1"), accountRow(1001, "p1")];
    queues["game_accounts"] = [
      { data: page1, error: null },
      { data: page2, error: null },
    ];
    queues["players"] = [
      { data: [{ id: "p1", display_name: "P One", email: null }], error: null },
    ];
    queues["games"] = [{ data: [{ id: "g1", name: "Juwa" }], error: null }];
    const rows = await getSheetLog();
    expect(rows).toHaveLength(1002);
    expect(rows[1001].username).toBe("u1001");
    expect(
      calls.filter((c) => c.table === "game_accounts" && c.method === "range")
        .length,
    ).toBe(2);
  });

  it("chunks player lookups past 500 ids", async () => {
    const players = Array.from({ length: 600 }, (_, i) => `p${i}`);
    queues["game_accounts"] = [
      {
        data: players.map((pid, i) => accountRow(i, pid)),
        error: null,
      },
    ];
    queues["players"] = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    queues["games"] = [{ data: [{ id: "g1", name: "Juwa" }], error: null }];
    await getSheetLog();
    expect(
      calls.filter((c) => c.table === "players" && c.method === "in").length,
    ).toBe(2);
  });
});
