import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

import { assertSessionMatches, getSessionUserId } from "../_auth";

function session(userId: string | null) {
  getUser.mockResolvedValue({ data: { user: userId ? { id: userId } : null } });
}

describe("getSessionUserId", () => {
  beforeEach(() => getUser.mockReset());

  it("returns the signed-in user id", async () => {
    session("admin-1");
    await expect(getSessionUserId()).resolves.toBe("admin-1");
  });

  it("returns null when there is no session", async () => {
    session(null);
    await expect(getSessionUserId()).resolves.toBeNull();
  });
});

describe("assertSessionMatches", () => {
  beforeEach(() => getUser.mockReset());

  it("resolves when the session user IS the given admin", async () => {
    session("admin-1");
    await expect(assertSessionMatches("admin-1")).resolves.toBeUndefined();
  });

  it("throws when the session user differs from the given admin", async () => {
    session("admin-1");
    await expect(assertSessionMatches("admin-2")).rejects.toThrow("Not authorized");
  });

  it("throws when there is no session at all", async () => {
    session(null);
    await expect(assertSessionMatches("admin-1")).rejects.toThrow("Not authorized");
  });
});
