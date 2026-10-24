import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M2: the inbox preview must come from one latest message PER
 * player, not a shared newest-500 window — otherwise chatty players
 * crowd quiet ones out and their rows wrongly show "No messages yet".
 * The RPC path serves every messaged player; when the RPC is not
 * deployed yet (migration 0020), the old window runs as a fallback so
 * the inbox never breaks.
 */

import { ADMIN_ROW, chainable, getUser, session } from "./mocks";

const rpcResults: Record<string, unknown> = {};
const queues: Record<string, unknown[]> = {};
const callCounts: Record<string, number> = {};

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (name: string) =>
      rpcResults[name] ?? { data: [], error: null },
    from: (table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;
      if (table === "admin_users") {
        return chainable({ data: ADMIN_ROW, error: null });
      }
      return chainable(pop(table));
    },
  }),
}));

import { getInboxOverview } from "../_actions";

const CHATTY = {
  id: "p1",
  display_name: "Chatty",
  email: "c@x",
  avatar_url: null,
  is_online: true,
  created_at: "2026-10-24T00:00:00Z",
};
const QUIET = {
  id: "p2",
  display_name: "Quiet",
  email: "q@x",
  avatar_url: null,
  is_online: false,
  created_at: "2026-10-23T00:00:00Z",
};

function baseSetup() {
  queues["players"] = [
    { data: [CHATTY, QUIET], error: null },
    { data: [], error: null }, // last-seen map
  ];
  queues["player_tags"] = [{ data: [], error: null }];
  queues["chat_messages"] = [];
  for (const k of Object.keys(callCounts)) delete callCounts[k];
  rpcResults["player_overview_counts"] = { data: [], error: null };
}

describe("getInboxOverview latest message (audit M2)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    baseSetup();
  });

  it("RPC path shows the quiet player's old message instead of 'No messages yet'", async () => {
    rpcResults["player_latest_messages"] = {
      data: [
        {
          player_id: "p1",
          kind: "text",
          body: { text: "new msg" },
          created_at: "2026-10-24T10:00:00Z",
        },
        {
          player_id: "p2",
          kind: "text",
          body: { text: "old hello" },
          created_at: "2026-10-20T10:00:00Z",
        },
      ],
      error: null,
    };
    const rows = await getInboxOverview();
    expect(rows).toHaveLength(2);
    // Newest activity first, quiet player above never-messaged (none here).
    expect(rows[0].id).toBe("p1");
    expect(rows[0].lastPreview).toBe("new msg");
    expect(rows[1].id).toBe("p2");
    expect(rows[1].lastPreview).toBe("old hello");
    expect(rows[1].lastMessageAt).toBe("2026-10-20T10:00:00Z");
    // No shared-window query ran at all on the RPC path.
    expect(callCounts["chat_messages"]).toBeUndefined();
  });

  it("falls back to the old window when the RPC is not deployed yet", async () => {
    rpcResults["player_latest_messages"] = {
      data: null,
      error: { message: "function not found" },
    };
    queues["chat_messages"] = [
      {
        data: [
          {
            player_id: "p1",
            kind: "text",
            body: { text: "new msg" },
            created_at: "2026-10-24T10:00:00Z",
          },
        ],
        error: null,
      },
    ];
    const rows = await getInboxOverview();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("p1");
    expect(rows[0].lastPreview).toBe("new msg");
    expect(callCounts["chat_messages"]).toBe(1);
  });
});
