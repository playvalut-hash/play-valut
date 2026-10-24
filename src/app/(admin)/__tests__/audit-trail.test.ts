import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H9: admin actions persist a row in audit_log (not just stdout),
 * and the viewer maps admin names with pagination. The stub serves
 * per-table result queues and records audit inserts and range calls.
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

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
];

const queues: Record<string, unknown[]> = {};
const auditInserts: unknown[] = [];
const rangeCalls: unknown[][] = [];

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function recording(result: unknown, table: string) {
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = (...args: unknown[]) => {
      if (table === "audit_log" && m === "insert") auditInserts.push(args[0]);
      if (m === "range") rangeCalls.push(args);
      return q;
    };
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
      // Queued admin_users results first (requireAdminRow, then the name
      // lookup); otherwise the standard super-admin row.
      if (table === "admin_users" && (queues[table] ?? []).length > 0) {
        return recording(pop(table), table);
      }
      if (table === "admin_users") {
        return recording({ data: ADMIN_ROW, error: null }, table);
      }
      return recording(pop(table), table);
    },
  }),
}));

import { approveDeposit, getAuditLog } from "../_actions";

const DEP = "22222222-2222-4222-8222-222222222222";

function reset() {
  for (const k of Object.keys(queues)) delete queues[k];
  auditInserts.length = 0;
  rangeCalls.length = 0;
}

describe("audit persistence (audit H9)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    reset();
  });

  it("approveDeposit writes an audit_log row, not just stdout", async () => {
    queues["deposits"] = [
      {
        data: {
          id: DEP,
          player_id: "p1",
          amount: 50,
          status: "pending",
          payment_method_id: "cashapp",
        },
        error: null,
      },
      { data: [{ id: DEP }], error: null },
      { data: [], error: null },
    ];
    queues["chat_messages"] = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    await approveDeposit("admin-1", DEP);
    expect(auditInserts).toContainEqual({
      admin_id: "admin-1",
      action: "deposits.approve",
      detail: `${DEP} amount=50`,
    });
  });

  it("getAuditLog maps admin names and pages newest-first", async () => {
    queues["audit_log"] = [
      {
        data: [
          {
            id: "a1",
            admin_id: "admin-1",
            action: "deposits.approve",
            detail: "x",
            created_at: "2026-10-24T01:00:00Z",
          },
          {
            id: "a2",
            admin_id: "gone-admin",
            action: "player.block",
            detail: null,
            created_at: "2026-10-24T00:00:00Z",
          },
        ],
        error: null,
      },
    ];
    queues["admin_users"] = [
      { data: ADMIN_ROW, error: null }, // requireSuperAdmin row
      {
        data: [{ id: "admin-1", display_name: "Super", email: "a@x" }],
        error: null,
      }, // name lookup
    ];
    const rows = await getAuditLog("admin-1");
    expect(rows).toHaveLength(2);
    expect(rows[0].adminName).toBe("Super");
    expect(rows[1].adminName).toBe("Unknown");
    expect(rangeCalls).toEqual([[0, 49]]);
  });
});
