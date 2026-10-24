import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H2/H3: inbox search must reach the database (with LIKE wildcards
 * escaped) and both the inbox list and the notifications feed must page
 * with offset/limit instead of a hard cap. The service stub records the
 * query-builder calls so the tests assert on the actual query shape.
 */

import { ADMIN_ROW, chainable, getUser, session } from "./mocks";

const playerCalls: Record<string, unknown[][]> = {};
const notifCalls: Record<string, unknown[][]> = {};

function recording(result: unknown, calls: Record<string, unknown[][]>) {
  const q: Record<string, unknown> = {};
  for (const m of [
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
  ]) {
    q[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
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
        return chainable({ data: ADMIN_ROW, error: null });
      }
      if (table === "players") {
        return recording({ data: [], error: null }, playerCalls);
      }
      if (table === "notifications") {
        return recording({ data: [], error: null }, notifCalls);
      }
      return chainable({ data: [], error: null });
    },
  }),
}));

import { getInboxOverview, getNotifications } from "../_actions";

describe("getInboxOverview paging (audit H2)", () => {
  beforeEach(() => {
    getUser.mockReset();
    for (const k of Object.keys(playerCalls)) delete playerCalls[k];
    session("admin-1");
  });

  it("pages the default window with range(0, 99)", async () => {
    await getInboxOverview();
    expect(playerCalls["range"]).toEqual([[0, 99]]);
    expect(playerCalls["or"]).toBeUndefined();
  });

  it("searches server-side with escaped LIKE wildcards", async () => {
    await getInboxOverview({ search: "a%b_c\\d" });
    expect(playerCalls["or"]).toEqual([
      [
        "display_name.ilike.%a\\%b\\_c\\\\d%,email.ilike.%a\\%b\\_c\\\\d%",
      ],
    ]);
  });

  it("pages older players with offset", async () => {
    await getInboxOverview({ limit: 100, offset: 200 });
    expect(playerCalls["range"]).toEqual([[200, 299]]);
  });
});

describe("getNotifications paging (audit H3)", () => {
  beforeEach(() => {
    getUser.mockReset();
    for (const k of Object.keys(notifCalls)) delete notifCalls[k];
    session("admin-1");
  });

  it("defaults to the first 30", async () => {
    await getNotifications();
    expect(notifCalls["range"]).toEqual([[0, 29]]);
  });

  it("pages with the caller's limit and offset", async () => {
    await getNotifications({ limit: 10, offset: 20 });
    expect(notifCalls["range"]).toEqual([[20, 29]]);
  });
});
