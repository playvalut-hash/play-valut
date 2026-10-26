import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Super-admin-only password reset: the role gate, the guest refusal,
 * the validation, and the Admin API call itself.
 */

import { getUser, session } from "./mocks";

let adminRow: Record<string, unknown> = {};
const queues: Record<string, unknown[]> = {};
const updateUserById = vi.fn();

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
      return chain(pop(table));
    },
    auth: { admin: { updateUserById } },
  }),
}));

import { resetPlayerPassword } from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";

const SUPER = {
  id: "admin-1",
  role: "super_admin",
  display_name: "Super",
  email: "admin@playvalut.com",
  is_active: true,
  permissions: null,
};

const AGENT = {
  id: "admin-1",
  role: "agent",
  display_name: "Agent",
  email: "agent@playvalut.com",
  is_active: true,
  permissions: {},
};

function queuePlayers(row: unknown) {
  queues["players"] = [{ data: row, error: null }];
}

describe("resetPlayerPassword", () => {
  beforeEach(() => {
    getUser.mockReset();
    updateUserById.mockReset();
    updateUserById.mockResolvedValue({
      data: { user: { id: PLAYER } },
      error: null,
    });
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
  });

  it("an agent cannot reset (super admin only)", async () => {
    adminRow = AGENT;
    const res = await resetPlayerPassword("admin-1", PLAYER, "newpass1");
    expect(res).toEqual({ ok: false, error: "Not authorized" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a short password", async () => {
    adminRow = SUPER;
    const res = await resetPlayerPassword("admin-1", PLAYER, "123");
    expect(res).toEqual({
      ok: false,
      error: "Password must be at least 6 characters",
    });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a missing player", async () => {
    adminRow = SUPER;
    queuePlayers(null);
    const res = await resetPlayerPassword("admin-1", PLAYER, "newpass1");
    expect(res).toEqual({ ok: false, error: "Player not found" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a guest (no email)", async () => {
    adminRow = SUPER;
    queuePlayers({ id: PLAYER, email: null });
    const res = await resetPlayerPassword("admin-1", PLAYER, "newpass1");
    expect(res).toEqual({
      ok: false,
      error: "Guest accounts have no password to reset",
    });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("resets a registered player's password", async () => {
    adminRow = SUPER;
    queuePlayers({ id: PLAYER, email: "bilal@gmail.com" });
    const res = await resetPlayerPassword("admin-1", PLAYER, "newpass1");
    expect(res).toEqual({ ok: true });
    expect(updateUserById).toHaveBeenCalledWith(PLAYER, {
      password: "newpass1",
    });
  });
});
