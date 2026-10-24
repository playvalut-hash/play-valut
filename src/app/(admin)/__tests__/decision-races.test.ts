import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H8: deposit decisions and account activation must be atomic —
 * the status change itself carries the expected-status condition, so a
 * concurrent decision sees zero affected rows and sends no duplicate
 * message. The stub serves per-table result queues and logs method calls
 * so each test asserts on both the outcome and the side effects.
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

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function recording(result: unknown, table: string) {
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = () => {
      methodLog.push({ table, method: m });
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

import {
  approveDeposit,
  markAccountActive,
} from "../_actions";

const DEP = "22222222-2222-4222-8222-222222222222";
const ACC = "33333333-3333-4333-8333-333333333333";

function reset() {
  for (const k of Object.keys(queues)) delete queues[k];
  methodLog.length = 0;
}

const count = (table: string, method: string) =>
  methodLog.filter((c) => c.table === table && c.method === method).length;

describe("approveDeposit atomic decision (audit H8)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    reset();
  });

  it("winner sends exactly one approval message", async () => {
    queues["deposits"] = [
      {
        data: {
          id: DEP,
          player_id: "p1",
          amount: 50,
          status: "pending",
          payment_method_id: "cashapp",
        },
        error: null,
      },
      { data: [{ id: DEP }], error: null }, // conditional update: 1 row
      { data: [], error: null }, // retention sweep: decided select
    ];
    queues["chat_messages"] = [
      { data: [], error: null }, // approval message insert
      { data: [], error: null }, // retention sweep: chat select
    ];
    await approveDeposit("admin-1", DEP);
    expect(count("chat_messages", "insert")).toBe(1);
  });

  it("loser throws before any message when the update affects zero rows", async () => {
    queues["deposits"] = [
      {
        data: {
          id: DEP,
          player_id: "p1",
          amount: 50,
          status: "pending",
          payment_method_id: "cashapp",
        },
        error: null,
      },
      { data: [], error: null }, // conditional update: 0 rows — decided concurrently
    ];
    await expect(approveDeposit("admin-1", DEP)).rejects.toThrow(
      "Deposit already decided",
    );
    expect(count("chat_messages", "insert")).toBe(0);
  });

  it("sequential already-decided deposit never reaches the update", async () => {
    queues["deposits"] = [
      {
        data: {
          id: DEP,
          player_id: "p1",
          amount: 50,
          status: "approved",
          payment_method_id: "cashapp",
        },
        error: null,
      },
    ];
    await expect(approveDeposit("admin-1", DEP)).rejects.toThrow(
      "Deposit already decided",
    );
    expect(count("deposits", "update")).toBe(0);
  });
});

describe("markAccountActive atomic activation (audit H8)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    reset();
  });

  it("winner sends exactly one ready message", async () => {
    queues["game_accounts"] = [
      {
        data: { id: ACC, player_id: "p1", game_id: "juwa", status: "creating" },
        error: null,
      },
      { data: [{ id: ACC }], error: null }, // conditional update: 1 row
    ];
    queues["chat_messages"] = [
      { data: [], error: null }, // card lookup: no card
      { data: [], error: null }, // ready message insert
    ];
    queues["games"] = [{ data: { name: "Juwa" }, error: null }];
    await markAccountActive("admin-1", ACC);
    expect(count("chat_messages", "insert")).toBe(1);
  });

  it("loser returns early with no message when the update affects zero rows", async () => {
    queues["game_accounts"] = [
      {
        data: { id: ACC, player_id: "p1", game_id: "juwa", status: "creating" },
        error: null,
      },
      { data: [], error: null }, // conditional update: 0 rows — activated concurrently
    ];
    queues["chat_messages"] = [{ data: [], error: null }]; // card lookup
    queues["games"] = [{ data: { name: "Juwa" }, error: null }];
    await expect(markAccountActive("admin-1", ACC)).resolves.toBeUndefined();
    expect(count("chat_messages", "insert")).toBe(0);
  });

  it("sequential already-active account never reaches the update", async () => {
    queues["game_accounts"] = [
      {
        data: { id: ACC, player_id: "p1", game_id: "juwa", status: "active" },
        error: null,
      },
    ];
    await expect(markAccountActive("admin-1", ACC)).resolves.toBeUndefined();
    expect(count("game_accounts", "update")).toBe(0);
  });
});
