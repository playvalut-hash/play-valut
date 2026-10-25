import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit Phase 4 (account lifecycle gaps): password reveal is gated on
 * an admin session and round-trips, and delete removes the row (the
 * M15 placeholder covers its thread card).
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

const queues: Record<string, unknown[]> = {};

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "maybeSingle", "update", "insert", "delete"]) {
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
        return chain({ data: ADMIN_ROW, error: null });
      }
      return chain(pop(table));
    },
  }),
}));

import { encryptPassword } from "@/lib/crypto";

import { decryptAccountPassword, deleteGameAccount } from "../_actions";

const ACCOUNT = "66666666-6666-6666-8666-666666666666";

describe("account lifecycle gaps", () => {
  beforeAll(() => {
    process.env.GAME_CREDS_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterAll(() => {
    delete process.env.GAME_CREDS_KEY;
  });
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
  });

  it("password reveal round-trips for a session admin", async () => {
    queues["game_accounts"] = [
      { data: { password_enc: encryptPassword("hunter2-hunter2") }, error: null },
    ];
    await expect(decryptAccountPassword("admin-1", ACCOUNT)).resolves.toBe(
      "hunter2-hunter2",
    );
  });

  it("password reveal rejects a mismatched session", async () => {
    session("someone-else");
    await expect(decryptAccountPassword("admin-1", ACCOUNT)).rejects.toThrow(
      "Not authorized",
    );
  });

  it("password reveal reports a missing account", async () => {
    queues["game_accounts"] = [{ data: null, error: null }];
    await expect(decryptAccountPassword("admin-1", ACCOUNT)).rejects.toThrow(
      "Account not found",
    );
  });

  it("delete removes the row", async () => {
    queues["game_accounts"] = [
      { data: { id: ACCOUNT, player_id: "player-1" }, error: null },
      { data: [], error: null },
    ];
    await deleteGameAccount("admin-1", ACCOUNT);
  });

  it("delete reports a missing account", async () => {
    queues["game_accounts"] = [{ data: null, error: null }];
    await expect(deleteGameAccount("admin-1", ACCOUNT)).rejects.toThrow(
      "Account not found",
    );
  });
});
