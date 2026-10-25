import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M12: manual game-account edits must not be weaker than
 * generated accounts (12-character passwords, not 6), and a manual
 * username change must not collide with another account for the same
 * game — with a clear message, not the DB's cryptic constraint error.
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

const queues: Record<string, unknown[]> = {};
const calls: { table: string; method: string; args: unknown[] }[] = [];

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(table: string, result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "single", "maybeSingle", "update", "insert"]) {
    q[m] = (...args: unknown[]) => {
      calls.push({ table, method: m, args });
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

import { editGameAccount } from "../_actions";

const ACCOUNT = "66666666-6666-6666-8666-666666666666";

function reset() {
  for (const k of Object.keys(queues)) delete queues[k];
  calls.length = 0;
  queues["game_accounts"] = [
    {
      data: { id: ACCOUNT, player_id: "player-1", game_id: "juwa" },
      error: null,
    }, // existing row
  ];
}

describe("editGameAccount rules (audit M12)", () => {
  beforeAll(() => {
    process.env.GAME_CREDS_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterAll(() => {
    delete process.env.GAME_CREDS_KEY;
  });
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    reset();
  });

  it("rejects a 6-character manual password (12 is the floor)", async () => {
    await expect(
      editGameAccount("admin-1", {
        accountId: ACCOUNT,
        username: "player1",
        password: "abc123",
      }),
    ).rejects.toThrow();
    expect(
      calls.some((c) => c.table === "game_accounts" && c.method === "update"),
    ).toBe(false);
  });

  it("accepts a 12-character manual password", async () => {
    queues["game_accounts"].push(
      { data: null, error: null }, // no clash
      { data: [], error: null }, // update
    );
    await editGameAccount("admin-1", {
      accountId: ACCOUNT,
      username: "player1",
      password: "abcdefghijkl",
    });
    expect(
      calls.some((c) => c.table === "game_accounts" && c.method === "update"),
    ).toBe(true);
  });

  it("rejects a username another account already uses for the same game", async () => {
    queues["game_accounts"].push(
      { data: { id: "other-account" }, error: null }, // clash
    );
    await expect(
      editGameAccount("admin-1", {
        accountId: ACCOUNT,
        username: "taken",
      }),
    ).rejects.toThrow(
      "Another account already uses this username for this game",
    );
    expect(
      calls.some((c) => c.table === "game_accounts" && c.method === "update"),
    ).toBe(false);
  });

  it("checks the clash against the same game, excluding the account itself", async () => {
    queues["game_accounts"].push(
      { data: null, error: null },
      { data: [], error: null },
    );
    await editGameAccount("admin-1", {
      accountId: ACCOUNT,
      username: "player1",
    });
    const eqs = calls.filter(
      (c) => c.table === "game_accounts" && c.method === "eq",
    );
    expect(eqs).toContainEqual({
      table: "game_accounts",
      method: "eq",
      args: ["game_id", "juwa"],
    });
    expect(eqs).toContainEqual({
      table: "game_accounts",
      method: "eq",
      args: ["username", "player1"],
    });
    expect(
      calls.some(
        (c) =>
          c.table === "game_accounts" &&
          c.method === "neq" &&
          JSON.stringify(c.args) === JSON.stringify(["id", ACCOUNT]),
      ),
    ).toBe(true);
  });
});
