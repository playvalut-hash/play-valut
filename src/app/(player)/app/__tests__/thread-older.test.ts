import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M3 (player side): older thread pages from a (created_at, id)
 * cursor, own rows only, limit+1 reporting hasMore exactly. Invalid
 * cursor or no user yields an empty page (fail-soft, like
 * getAccountCard's null).
 */

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
  "upsert",
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

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser },
    from: (table: string) => recording(pop(table)),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => recording(pop(table)),
  }),
}));

import { getThreadOlder } from "../_actions";

function textRow(id: string, created_at: string) {
  return {
    id,
    player_id: "player-1",
    sender: "player",
    kind: "text",
    body: { text: `msg ${id}` },
    is_read_by_admin: false,
    is_read_by_player: true,
    created_at,
  };
}

function reset() {
  for (const k of Object.keys(queues)) delete queues[k];
  orArgs.length = 0;
  getUser.mockReset();
  getUser.mockResolvedValue({
    data: { user: { id: "player-1", email: "p@test.com", user_metadata: {} } },
    error: null,
  });
}

describe("getThreadOlder (audit M3, player)", () => {
  beforeEach(reset);

  it("returns an older page ascending with the tie-safe cursor", async () => {
    queues["chat_messages"] = [
      {
        data: [
          textRow("55555555-5555-4555-8555-000000000002", "2026-10-20T10:01:00Z"),
          textRow("55555555-5555-4555-8555-000000000001", "2026-10-20T10:00:00Z"),
        ],
        error: null,
      },
    ];
    const page = await getThreadOlder({
      beforeCreatedAt: "2026-10-21T00:00:00Z",
      beforeId: "66666666-6666-4666-8666-666666666666",
    });
    expect(page.messages).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.messages[0].id).toBe("55555555-5555-4555-8555-000000000001");
    expect(orArgs[0]).toContain("created_at.lt.2026-10-21T00:00:00Z");
    expect(orArgs[0]).toContain("id.lt.66666666-6666-4666-8666-666666666666");
  });

  it("reports hasMore exactly at the 201-row boundary", async () => {
    const rows = Array.from({ length: 201 }, (_, i) =>
      textRow(
        `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`,
        "2026-10-20T10:00:00Z",
      ),
    );
    queues["chat_messages"] = [{ data: rows, error: null }];
    const page = await getThreadOlder({
      beforeCreatedAt: "2026-10-21T00:00:00Z",
      beforeId: "66666666-6666-4666-8666-666666666666",
    });
    expect(page.messages).toHaveLength(200);
    expect(page.hasMore).toBe(true);
  });

  it("returns an empty page for an invalid cursor or no user", async () => {
    await expect(
      getThreadOlder({ beforeCreatedAt: "nope", beforeId: "x" }),
    ).resolves.toEqual({ messages: [], hasMore: false });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      getThreadOlder({
        beforeCreatedAt: "2026-10-21T00:00:00Z",
        beforeId: "66666666-6666-4666-8666-666666666666",
      }),
    ).resolves.toEqual({ messages: [], hasMore: false });
  });
});
