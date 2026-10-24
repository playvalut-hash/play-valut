import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M3: older thread pages come from a (created_at, id) cursor —
 * strictly older rows, ties exact, limit+1 reporting hasMore — with the
 * same card resolution as getThread.
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
const orArgs: unknown[] = [];

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function recording(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = (...args: unknown[]) => {
      if (m === "or") orArgs.push(args[0]);
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
      if (table === "admin_users") {
        return recording({ data: ADMIN_ROW, error: null });
      }
      return recording(pop(table));
    },
  }),
}));

import { getThreadOlder } from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";

function textRow(id: string, created_at: string) {
  return {
    id,
    player_id: PLAYER,
    sender: "player",
    kind: "text",
    body: { text: `msg ${id}` },
    created_at,
    is_read_by_player: true,
    is_read_by_admin: false,
  };
}

function reset() {
  for (const k of Object.keys(queues)) delete queues[k];
  orArgs.length = 0;
}

describe("getThreadOlder (audit M3)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    reset();
    queues["games"] = [{ data: [], error: null }];
    queues["payment_methods"] = [{ data: [], error: null }];
  });

  it("returns one older page ascending with exact hasMore", async () => {
    const rows = Array.from({ length: 201 }, (_, i) =>
      textRow(
        `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`,
        `2026-10-20T10:${String(59 - (i % 60)).padStart(2, "0")}:00Z`,
      ),
    );
    queues["chat_messages"] = [{ data: rows, error: null }];
    const page = await getThreadOlder(PLAYER, {
      beforeCreatedAt: "2026-10-21T00:00:00Z",
      beforeId: "66666666-6666-4666-8666-666666666666",
    });
    expect(page.messages).toHaveLength(200);
    expect(page.hasMore).toBe(true);
    // Ascending: first is the oldest of the returned page.
    expect(page.messages[0].createdAt <= page.messages[199].createdAt).toBe(true);
    // Cursor covers both halves of the tie-safe comparison.
    expect(orArgs[0]).toContain("created_at.lt.2026-10-21T00:00:00Z");
    expect(orArgs[0]).toContain("id.lt.66666666-6666-4666-8666-666666666666");
  });

  it("returns a short final page with hasMore false", async () => {
    queues["chat_messages"] = [
      {
        data: [
          textRow("55555555-5555-4555-8555-000000000002", "2026-10-20T10:01:00Z"),
          textRow("55555555-5555-4555-8555-000000000001", "2026-10-20T10:00:00Z"),
        ],
        error: null,
      },
    ];
    const page = await getThreadOlder(PLAYER, {
      beforeCreatedAt: "2026-10-21T00:00:00Z",
      beforeId: "66666666-6666-4666-8666-666666666666",
    });
    expect(page.messages).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.messages[0].id).toBe("55555555-5555-4555-8555-000000000001");
  });

  it("rejects an invalid cursor and a missing session", async () => {
    await expect(
      getThreadOlder(PLAYER, {
        beforeCreatedAt: "not-a-date",
        beforeId: "66666666-6666-4666-8666-666666666666",
      }),
    ).rejects.toThrow();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      getThreadOlder(PLAYER, {
        beforeCreatedAt: "2026-10-21T00:00:00Z",
        beforeId: "66666666-6666-4666-8666-666666666666",
      }),
    ).rejects.toThrow();
  });
});
