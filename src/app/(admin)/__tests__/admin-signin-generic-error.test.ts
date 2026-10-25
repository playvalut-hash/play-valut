import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M8: admin sign-in must not leak account existence. The old
 * code answered "No account found with this email" for unknown emails
 * and "Incorrect password" for known ones — a trivial enumeration
 * oracle. Every failure path must now return the identical message,
 * and an unauthorized session must still be signed out.
 */

const signInWithPassword = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();

let adminRow: unknown = null;

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "maybeSingle", "insert"]) {
    q[m] = () => q;
  }
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { signInWithPassword, getUser, signOut },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "admin_users") {
        return chain({ data: adminRow, error: null });
      }
      return chain({ data: [], error: null });
    },
  }),
}));

import { adminSignIn } from "../_actions";

const GENERIC = "Invalid email or password";

async function rejectionMessage(email: string, password: string) {
  try {
    await adminSignIn({ email, password });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return "NO ERROR (unexpected success)";
}

describe("adminSignIn generic error (audit M8)", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    getUser.mockReset();
    signOut.mockClear();
    adminRow = null;
  });

  it("unknown email and wrong password produce the identical message", async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const unknown = await rejectionMessage(
      "nobody@example.com",
      "correct-horse-battery",
    );
    const wrongPassword = await rejectionMessage(
      "admin@playvalut.com",
      "correct-horse-battery",
    );
    expect(unknown).toBe(GENERIC);
    expect(wrongPassword).toBe(GENERIC);
    expect(unknown).toBe(wrongPassword);
  });

  it("a valid auth user who is not an admin gets the same message and is signed out", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    adminRow = null;
    expect(
      await rejectionMessage("player@example.com", "correct-horse-battery"),
    ).toBe(GENERIC);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("an inactive admin gets the same message and is signed out", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    adminRow = { id: "admin-1", is_active: false };
    expect(
      await rejectionMessage("admin@playvalut.com", "correct-horse-battery"),
    ).toBe(GENERIC);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("an active admin still signs in", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    adminRow = { id: "admin-1", is_active: true };
    await expect(
      adminSignIn({
        email: "admin@playvalut.com",
        password: "correct-horse-battery",
      }),
    ).resolves.toEqual({ ok: true });
    expect(signOut).not.toHaveBeenCalled();
  });
});
