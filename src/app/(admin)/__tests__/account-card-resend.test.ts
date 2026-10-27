import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resend an active game account's card: the session binding, the
 * missing/non-active refusals, and the exact card message inserted.
 */

import { getUser, session } from "./mocks";

let adminRow: Record<string, unknown> = {};
const queues: Record<string, unknown[]> = {};
const insertSpy = vi.fn();

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "single",
    "maybeSingle",
    "update",
    "insert",
    "order",
    "range",
    "limit",
  ]) {
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
        return chain({ data: adminRow, error: null });
      }
      const q = chain(pop(table));
      if (table === "chat_messages") {
        const origInsert = q.insert as (row: unknown) => unknown;
        q.insert = (row: unknown) => {
          insertSpy(row);
          return origInsert(row);
        };
      }
      return q;
    },
  }),
}));

import { resendGameAccountCard } from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";
const ACCOUNT = "55555555-5555-5555-8555-555555555555";

const SUPER = {
  id: "admin-1",
  role: "super_admin",
  display_name: "Super",
  email: "admin@playvalut.com",
  is_active: true,
  permissions: null,
};

function queueAccount(row: unknown) {
  queues["game_accounts"] = [{ data: row, error: null }];
}

describe("resendGameAccountCard", () => {
  beforeEach(() => {
    getUser.mockReset();
    insertSpy.mockReset();
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
  });

  it("refuses a session mismatch (not authorized)", async () => {
    adminRow = SUPER;
    session("someone-else");
    const res = await resendGameAccountCard("admin-1", ACCOUNT);
    expect(res).toEqual({ ok: false, error: "Not authorized" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("refuses a missing account", async () => {
    adminRow = SUPER;
    queueAccount(null);
    const res = await resendGameAccountCard("admin-1", ACCOUNT);
    expect(res).toEqual({ ok: false, error: "Account not found" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("refuses a non-active account", async () => {
    adminRow = SUPER;
    queueAccount({
      id: ACCOUNT,
      player_id: PLAYER,
      game_id: "juwa",
      status: "creating",
    });
    const res = await resendGameAccountCard("admin-1", ACCOUNT);
    expect(res).toEqual({
      ok: false,
      error: "Only active accounts can be resent",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("sends the same active card form for an active account", async () => {
    adminRow = SUPER;
    queueAccount({
      id: ACCOUNT,
      player_id: PLAYER,
      game_id: "juwa",
      status: "active",
    });
    const res = await resendGameAccountCard("admin-1", ACCOUNT);
    expect(res).toEqual({ ok: true });
    expect(insertSpy).toHaveBeenCalledWith({
      player_id: PLAYER,
      sender: "system",
      kind: "account",
      body: { game_id: "juwa", account_id: ACCOUNT, status: "active" },
      is_read_by_player: false,
      is_read_by_admin: true,
    });
  });
});
