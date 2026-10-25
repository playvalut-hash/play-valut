import { describe, expect, it, vi } from "vitest";

/**
 * Build 41 regression: game ids are TEXT slugs, not uuids. The
 * request schema must accept slugs ("juwa") — the old uuid validation
 * rejected every real game id. Proven behaviorally: an empty id
 * redirects to /app (schema rejection, before any session check),
 * while a slug passes validation and reaches the session check
 * (no session here, so /login).
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            single: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requestGameAccount } from "../_actions";

async function redirectTarget(gameId: string) {
  try {
    await requestGameAccount(gameId);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return "NO REDIRECT";
}

describe("game id slugs (Build 41 regression)", () => {
  it("rejects an empty id at the schema", async () => {
    expect(await redirectTarget("")).toBe("REDIRECT:/app");
  });

  it("rejects an over-long id at the schema", async () => {
    expect(await redirectTarget("x".repeat(65))).toBe("REDIRECT:/app");
  });

  it("accepts a slug and reaches the session check", async () => {
    expect(await redirectTarget("juwa")).toBe("REDIRECT:/login");
  });

  it("accepts a uuid-shaped id too (the schema is min/max, not uuid)", async () => {
    expect(await redirectTarget("44444444-4444-4444-8444-444444444444")).toBe(
      "REDIRECT:/login",
    );
  });
});
