import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H11: blocked players must be stopped server-side in the two
 * account paths that had no check — requestGameAccount (new account)
 * and getAccountCard (credential reveal). The app shell also locks
 * blocked players out, but it fails open on a lookup hiccup, so the
 * actions must enforce it themselves.
 */

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
  "upsert",
];

const sessionQueues: Record<string, unknown[]> = {};
const serviceQueues: Record<string, unknown[]> = {};
const sessionTables: string[] = [];
const serviceTables: string[] = [];

function pop(queues: Record<string, unknown[]>, table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function recording(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = () => q;
  }
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

const getUser = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...(args as [string])),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser },
    from: (table: string) => {
      sessionTables.push(table);
      return recording(pop(sessionQueues, table));
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      serviceTables.push(table);
      return recording(pop(serviceQueues, table));
    },
  }),
}));

import { encryptPassword } from "@/lib/crypto";
import { getAccountCard, requestGameAccount } from "../_actions";

const PLAYER = {
  id: "player-1",
  email: "p@test.com",
  user_metadata: {},
};

function reset() {
  for (const k of Object.keys(sessionQueues)) delete sessionQueues[k];
  for (const k of Object.keys(serviceQueues)) delete serviceQueues[k];
  sessionTables.length = 0;
  serviceTables.length = 0;
  redirectMock.mockClear();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: PLAYER }, error: null });
}

describe("blocked players and game accounts (audit H11)", () => {
  beforeAll(() => {
    process.env.GAME_CREDS_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterAll(() => {
    delete process.env.GAME_CREDS_KEY;
  });
  beforeEach(reset);

  it("requestGameAccount stops a blocked player before the catalog fetch", async () => {
    serviceQueues["players"] = [{ data: { is_blocked: true }, error: null }];
    await expect(requestGameAccount("juwa")).rejects.toThrow("REDIRECT:/app");
    expect(redirectMock).toHaveBeenCalledWith("/app");
    expect(serviceTables).not.toContain("games");
    expect(serviceTables).not.toContain("game_accounts");
  });

  it("requestGameAccount proceeds to the catalog for an unblocked player", async () => {
    serviceQueues["players"] = [{ data: { is_blocked: false }, error: null }];
    serviceQueues["games"] = [{ data: [], error: null }];
    await expect(requestGameAccount("juwa")).rejects.toThrow("REDIRECT:/app");
    expect(serviceTables).toContain("games");
  });

  it("getAccountCard returns null for a blocked player without touching game_accounts", async () => {
    serviceQueues["players"] = [{ data: { is_blocked: true }, error: null }];
    await expect(getAccountCard("33333333-3333-4333-8333-333333333333")).resolves.toBeNull();
    expect(sessionTables).not.toContain("game_accounts");
  });

  it("getAccountCard reveals the card for an unblocked player", async () => {
    serviceQueues["players"] = [{ data: { is_blocked: false }, error: null }];
    sessionQueues["game_accounts"] = [
      {
        data: {
          id: "33333333-3333-4333-8333-333333333333",
          game_id: "juwa",
          username: "player1",
          password_enc: encryptPassword("hunter2"),
          status: "active",
          game: { id: "juwa", name: "Juwa" },
        },
        error: null,
      },
    ];
    const card = await getAccountCard("33333333-3333-4333-8333-333333333333");
    expect(card).toMatchObject({
      username: "player1",
      password: "hunter2",
      gameName: "Juwa",
      status: "active",
    });
  });
});
