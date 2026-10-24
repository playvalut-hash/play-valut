import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M4: createGameAccountForPlayer must not leave an orphan
 * "creating" account when the follow-up writes fail — and unlike
 * before, those writes are actually checked (they used to fail
 * silently while the action reported success). On failure the note
 * message and the account row roll back, best-effort, and the
 * original error surfaces.
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

const METHODS = [
  "select",
  "eq",
  "neq",
  "in",
  "order",
  "limit",
  "gt",
  "gte",
  "lt",
  "lte",
  "single",
  "maybeSingle",
  "or",
  "range",
  "not",
  "delete",
  "update",
  "insert",
];

const queues: Record<string, unknown[]> = {};
const methodLog: { table: string; method: string }[] = [];
const auditInserts: unknown[] = [];

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function recording(result: unknown, table: string) {
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = (...args: unknown[]) => {
      methodLog.push({ table, method: m });
      if (table === "audit_log" && m === "insert") auditInserts.push(args[0]);
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
        return recording({ data: ADMIN_ROW, error: null }, table);
      }
      return recording(pop(table), table);
    },
  }),
}));

import { createGameAccountForPlayer } from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";

function reset() {
  for (const k of Object.keys(queues)) delete queues[k];
  methodLog.length = 0;
  auditInserts.length = 0;
  queues["games"] = [{ data: { id: "juwa", name: "Juwa" }, error: null }];
  queues["game_accounts"] = [
    { data: null, error: null }, // existing check: none
    { data: { id: "acc-1" }, error: null }, // account insert
  ];
}

const count = (table: string, method: string) =>
  methodLog.filter((c) => c.table === table && c.method === method).length;

describe("createGameAccountForPlayer atomicity (audit M4)", () => {
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

  it("success leaves no cleanup behind", async () => {
    queues["chat_messages"] = [
      { data: { id: "note-1" }, error: null }, // setup note
      { data: [], error: null }, // account card
    ];
    await createGameAccountForPlayer("admin-1", PLAYER, "juwa");
    expect(count("game_accounts", "delete")).toBe(0);
    expect(count("chat_messages", "delete")).toBe(0);
  });

  it("a failed setup note rolls back the account row", async () => {
    queues["chat_messages"] = [
      { data: null, error: { message: "db down" } }, // setup note fails
    ];
    queues["game_accounts"].push({ data: [], error: null }); // cleanup delete
    await expect(
      createGameAccountForPlayer("admin-1", PLAYER, "juwa"),
    ).rejects.toThrow("Could not send setup note");
    expect(count("game_accounts", "delete")).toBe(1);
    expect(count("chat_messages", "delete")).toBe(0); // no note existed
  });

  it("a failed card rolls back both the note and the account row", async () => {
    queues["chat_messages"] = [
      { data: { id: "note-1" }, error: null }, // setup note ok
      { data: null, error: { message: "db down" } }, // card fails
      { data: [], error: null }, // note delete
    ];
    queues["game_accounts"].push({ data: [], error: null }); // cleanup delete
    await expect(
      createGameAccountForPlayer("admin-1", PLAYER, "juwa"),
    ).rejects.toThrow("Could not send account card");
    expect(count("chat_messages", "delete")).toBe(1);
    expect(count("game_accounts", "delete")).toBe(1);
  });

  it("a failed cleanup still surfaces the original error and audits it", async () => {
    queues["chat_messages"] = [
      { data: { id: "note-1" }, error: null },
      { data: null, error: { message: "db down" } },
      { data: [], error: null },
    ];
    queues["game_accounts"].push({
      data: null,
      error: { message: "delete failed" },
    });
    await expect(
      createGameAccountForPlayer("admin-1", PLAYER, "juwa"),
    ).rejects.toThrow("Could not send account card");
    expect(auditInserts).toContainEqual({
      admin_id: "admin-1",
      action: "accounts.create_cleanup_failed",
      detail: `${PLAYER}/juwa/acc-1`,
    });
  });
});
