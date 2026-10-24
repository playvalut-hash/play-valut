import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit C2 guard tests: the admin read actions must refuse callers without
 * a signed-in, active admin session — even though they take no adminId.
 * The Supabase clients are fully mocked; no live database is touched.
 */

import { getUser, mockServiceClient, session } from "./mocks";

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mockServiceClient,
}));

import { getInboxOverview } from "../_actions";

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
