import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guest activation card: the admin's activation link must go out as a
 * gold card (kind "activate", body {url}) — never as a text bubble —
 * and the server only accepts the product's own activate route
 * (/app?activate=1), never an arbitrary link.
 */

import { getUser, session } from "./mocks";

let adminRow: Record<string, unknown> = {};
const queues: Record<string, unknown[]> = {};
const insertSpy = vi.fn();

function pop(table: string) {
  const q = queues[table] ?? [];
  return q.length > 0 ? q.shift() : { data: [], error: null };
}

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "single",
    "maybeSingle",
    "update",
    "insert",
    "order",
    "range",
    "limit",
  ]) {
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
      const q = chain(pop(table));
      if (table === "chat_messages") {
        const origInsert = q.insert as (row: unknown) => unknown;
        q.insert = (row: unknown) => {
          insertSpy(row);
          return origInsert(row);
        };
      }
      return q;
    },
  }),
}));

import { sendActivationCard } from "../_actions";

const PLAYER = "44444444-4444-4444-8444-444444444444";
const GOOD_URL = "https://play-valut.vercel.app/app?activate=1";

const SUPER = {
  id: "admin-1",
  role: "super_admin",
  display_name: "Super",
  email: "admin@playvalut.com",
  is_active: true,
  permissions: null,
};

describe("sendActivationCard", () => {
  beforeEach(() => {
    getUser.mockReset();
    insertSpy.mockReset();
    session("admin-1");
    adminRow = SUPER;
    for (const k of Object.keys(queues)) delete queues[k];
  });

  it("refuses a session mismatch", async () => {
    session("someone-else");
    await expect(
      sendActivationCard("admin-1", PLAYER, GOOD_URL),
    ).rejects.toThrow();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("refuses an arbitrary link", async () => {
    await expect(
      sendActivationCard("admin-1", PLAYER, "https://evil.example/steal"),
    ).rejects.toThrow("Invalid activation link");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("refuses the app URL without the activate parameter", async () => {
    await expect(
      sendActivationCard("admin-1", PLAYER, "https://play-valut.vercel.app/app"),
    ).rejects.toThrow("Invalid activation link");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("sends the activation card for the product's own activate route", async () => {
    await sendActivationCard("admin-1", PLAYER, GOOD_URL);
    expect(insertSpy).toHaveBeenCalledWith({
      player_id: PLAYER,
      sender: "admin",
      kind: "activate",
      body: { url: GOOD_URL },
      is_read_by_player: false,
      is_read_by_admin: true,
    });
  });
});
