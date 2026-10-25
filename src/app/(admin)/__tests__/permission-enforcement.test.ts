import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit Phase 4 (moderation + permissions): the four grants must
 * actually gate their actions, and super-admin-only paths must reject
 * agents — not just hide buttons in the UI.
 */

import { getUser, session } from "./mocks";

let adminRow: Record<string, unknown> = {};
const queues: Record<string, unknown[]> = {};

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "maybeSingle", "update", "insert", "order", "range", "limit"]) {
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
  }),
}));

import { getAuditLog, setPlayerBlocked } from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";

function agentRow(permissions: Record<string, boolean>) {
  return {
    id: "admin-1",
    role: "agent",
    display_name: "Agent",
    email: "agent@playvalut.com",
    is_active: true,
    permissions,
  };
}

describe("permission enforcement", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    for (const k of Object.keys(queues)) delete queues[k];
  });

  it("an agent without player_block cannot block", async () => {
    adminRow = agentRow({
      player_block: false,
      chat_clear: false,
      player_delete: false,
      shortcuts_manage: false,
    });
    await expect(setPlayerBlocked("admin-1", PLAYER, true)).rejects.toThrow(
      "Not authorized",
    );
  });

  it("an agent with player_block can block", async () => {
    adminRow = agentRow({
      player_block: true,
      chat_clear: false,
      player_delete: false,
      shortcuts_manage: false,
    });
    queues["players"] = [{ data: [], error: null }];
    await setPlayerBlocked("admin-1", PLAYER, true);
  });

  it("a super-admin-only path rejects agents", async () => {
    adminRow = agentRow({
      player_block: true,
      chat_clear: true,
      player_delete: true,
      shortcuts_manage: true,
    });
    await expect(getAuditLog("admin-1")).rejects.toThrow("Not authorized");
  });
});
