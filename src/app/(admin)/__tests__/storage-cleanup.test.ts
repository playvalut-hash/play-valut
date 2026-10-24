import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H7: clearing a chat deletes its screenshots from storage
 * immediately (both deposit proofs and chat images) and nulls the matching
 * deposit references; the 30-day sweeps delete decided-deposit screenshots
 * and old chat images but never a path still owned by a deposit row. The
 * service stub serves per-table result queues so each query in a flow gets
 * its own canned answer, and records storage removals and deposit updates.
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
];

function recording(
  result: unknown,
  calls: Record<string, unknown[][]>,
) {
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return q;
    };
  }
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

// Per-test queues: each from() call pops the next canned result for its
// table, so multi-query flows (sweep -> update -> orphan scan) are exact.
let chatQueue: unknown[] = [];
let depositsQueue: unknown[] = [];
let notifQueue: unknown[] = [];
const removedPaths: string[][] = [];
const depositsUpdates: { update: unknown[][]; in: unknown[][] }[] = [];
let listPages: { name: string }[][] = [];

function pop(queue: unknown[]) {
  return queue.length > 0 ? queue.shift() : { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
    from: (table: string) => {
      if (table === "admin_users") {
        return recording({ data: ADMIN_ROW, error: null }, {});
      }
      if (table === "chat_messages") {
        return recording(pop(chatQueue), {});
      }
      if (table === "deposits") {
        const calls: Record<string, unknown[][]> = {};
        const q = recording(pop(depositsQueue), calls);
        // Deposit updates (nulling references) are observed, not queued.
        const origUpdate = q["update"] as (...a: unknown[]) => unknown;
        q["update"] = (...args: unknown[]) => {
          depositsUpdates.push({ update: [args], in: [] });
          return origUpdate(...args);
        };
        const origIn = q["in"] as (...a: unknown[]) => unknown;
        q["in"] = (...args: unknown[]) => {
          const last = depositsUpdates[depositsUpdates.length - 1];
          if (last) last.in.push(args);
          return origIn(...args);
        };
        return q;
      }
      if (table === "notifications") {
        return recording(pop(notifQueue), {});
      }
      return recording({ data: [], error: null }, {});
    },
    storage: {
      from: () => ({
        list: async () => {
          const page = listPages.length > 0 ? listPages.shift()! : [];
          return { data: page, error: null };
        },
        remove: async (paths: string[]) => {
          removedPaths.push(paths);
          return { data: [], error: null };
        },
      }),
    },
  }),
}));

import {
  clearPlayerChat,
  deletePlayer,
  runStorageCleanup,
} from "../_actions";

const PLAYER = "11111111-1111-4111-8111-111111111111";

describe("clearPlayerChat storage cleanup (audit H7)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    chatQueue = [];
    depositsQueue = [];
    notifQueue = [];
    removedPaths.length = 0;
    depositsUpdates.length = 0;
    listPages = [];
  });

  it("deletes both deposit and chat screenshots immediately, and nulls deposit references", async () => {
    chatQueue = [
      {
        data: [
          { body: { screenshot_path: "p1/dep.png" } },
          { body: { screenshot_path: "p1/chat.png" } },
        ],
        error: null,
      },
      { data: [], error: null }, // row delete
    ];
    await clearPlayerChat("admin-1", PLAYER);
    expect(removedPaths).toEqual([["p1/dep.png", "p1/chat.png"]]);
    expect(depositsUpdates).toHaveLength(1);
    expect(depositsUpdates[0].update).toEqual([[{ screenshot_path: null }]]);
    expect(depositsUpdates[0].in).toEqual([
      ["screenshot_path", ["p1/dep.png", "p1/chat.png"]],
    ]);
  });
});

describe("runStorageCleanup retention sweeps (audit H7)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    chatQueue = [];
    depositsQueue = [];
    notifQueue = [];
    removedPaths.length = 0;
    depositsUpdates.length = 0;
    listPages = [];
  });

  it("deletes decided-deposit screenshots past retention and reports counts", async () => {
    depositsQueue = [
      // decided sweep select
      {
        data: [{ id: "d1", screenshot_path: "p1/old.png" }],
        error: null,
      },
      { data: [], error: null }, // nulling update
      [], // orphan scan: deposits range
    ];
    chatQueue = [
      { data: [], error: null }, // chat sweep select
      [], // orphan scan: chat range
    ];
    const out = await runStorageCleanup("admin-1");
    expect(out).toEqual({ decided: 1, chat: 0, orphans: 0, capped: false });
    expect(removedPaths).toEqual([["p1/old.png"]]);
  });

  it("chat sweep skips paths still owned by a deposit row", async () => {
    depositsQueue = [
      { data: [], error: null }, // decided sweep select: nothing old
      // chat sweep owned-check
      { data: [{ screenshot_path: "p1/owned.png" }], error: null },
      [], // orphan scan: deposits range
    ];
    chatQueue = [
      {
        data: [
          { body: { screenshot_path: "p1/owned.png" } },
          { body: { screenshot_path: "p1/free.png" } },
        ],
        error: null,
      },
      [], // orphan scan: chat range
    ];
    const out = await runStorageCleanup("admin-1");
    expect(out.chat).toBe(1);
    expect(removedPaths).toEqual([["p1/free.png"]]);
  });
});

describe("deletePlayer prefix cleanup (audit H7)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    chatQueue = [];
    depositsQueue = [];
    notifQueue = [];
    removedPaths.length = 0;
    depositsUpdates.length = 0;
    listPages = [[{ name: "a.png" }, { name: "b.png" }], []];
  });

  it("removes the player's whole screenshots prefix", async () => {
    await deletePlayer("admin-1", PLAYER);
    expect(removedPaths).toEqual([[`${PLAYER}/a.png`, `${PLAYER}/b.png`]]);
  });
});
