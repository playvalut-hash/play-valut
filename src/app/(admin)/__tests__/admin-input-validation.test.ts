import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M1: every admin action input is parsed with zod — no
 * exceptions. Garbage ids and non-boolean flags must be rejected
 * before they reach the database.
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

const queues: Record<string, unknown[]> = {};

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "neq",
    "in",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
    "update",
    "insert",
    "delete",
  ]) {
    q[m] = () => q;
  }
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

// toggleAgentActive revalidates /admin/agents — a Next.js runtime
// concern, stubbed out so the action's own logic is what gets tested.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
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

import {
  getPlayerDetail,
  getThread,
  markNotificationRead,
  markThreadRead,
  setPlayerBlocked,
  toggleAgentActive,
} from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";
const NOTIF = "77777777-7777-7777-8777-777777777777";
const TARGET = "88888888-8888-8888-8888-888888888888";
const OK = { data: [], error: null };

describe("admin input validation (audit M1)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
  });

  it("rejects garbage ids before any database work", async () => {
    await expect(
      markNotificationRead("admin-1", "not-a-uuid"),
    ).rejects.toThrow();
    await expect(markThreadRead("admin-1", "not-a-uuid")).rejects.toThrow();
    await expect(getThread("not-a-uuid")).rejects.toThrow();
    await expect(getPlayerDetail("not-a-uuid")).rejects.toThrow();
  });

  it("rejects non-boolean flags", async () => {
    await expect(
      toggleAgentActive("admin-1", TARGET, "yes" as unknown as boolean),
    ).rejects.toThrow();
    await expect(
      setPlayerBlocked("admin-1", PLAYER, "yes" as unknown as boolean),
    ).rejects.toThrow();
  });

  it("accepts well-formed inputs", async () => {
    queues["notifications"] = [OK];
    queues["chat_messages"] = [OK, { data: [], error: null }];
    queues["games"] = [OK];
    queues["payment_methods"] = [OK];
    queues["players"] = [{ data: null, error: null }, OK];
    await markNotificationRead("admin-1", NOTIF);
    await markThreadRead("admin-1", PLAYER);
    await expect(getThread(PLAYER)).resolves.toEqual([]);
    await expect(getPlayerDetail(PLAYER)).resolves.toBeNull();
    await toggleAgentActive("admin-1", TARGET, true);
    await setPlayerBlocked("admin-1", PLAYER, true);
  });
});
