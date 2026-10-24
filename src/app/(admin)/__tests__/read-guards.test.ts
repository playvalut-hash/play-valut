import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit C2 guard tests: the admin read actions must refuse callers without
 * a signed-in, active admin session — even though they take no adminId.
 * The Supabase clients are fully mocked; no live database is touched.
 */

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

function chainable(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of [
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
  ]) {
    q[m] = () => q;
  }
  // Awaiting the chain resolves to the stubbed result.
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

const ADMIN_ROW = {
  id: "admin-1",
  role: "super_admin",
  display_name: "Super",
  email: "admin@example.com",
  is_active: true,
  permissions: null,
};

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) =>
      table === "admin_users"
        ? chainable({ data: ADMIN_ROW, error: null })
        : chainable({ data: [], error: null }),
  }),
}));

import { getInboxOverview } from "../_actions";

function session(userId: string | null) {
  getUser.mockResolvedValue({ data: { user: userId ? { id: userId } : null } });
}

describe("getInboxOverview session guard (audit C2)", () => {
  beforeEach(() => getUser.mockReset());

  it("throws without any session", async () => {
    session(null);
    await expect(getInboxOverview()).rejects.toThrow("Not authorized");
  });

  it("returns the overview for a signed-in active admin", async () => {
    session("admin-1");
    await expect(getInboxOverview()).resolves.toEqual([]);
  });
});
