import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Player siblings of audit M4 (deliverAccount rollback) and M11
 * (orphan-upload cleanup): a failed account card must roll back the
 * just-created account, and a failed deposit/chat-image insert must
 * remove the just-uploaded screenshot.
 */

const PLAYER = "99999999-9999-9999-8999-999999999999";

const serverQueues: Record<string, unknown[]> = {};
const serviceQueues: Record<string, unknown[]> = {};
const serviceCalls: { table: string; method: string; args: unknown[] }[] = [];
const upload = vi.fn();
const remove = vi.fn();

function pop(q: Record<string, unknown[]>, table: string) {
  const arr = q[table] ?? [];
  return arr.length > 0 ? arr.shift() : { data: [], error: null };
}

function chain(
  table: string,
  result: unknown,
  record: boolean,
) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "order", "single", "maybeSingle", "update", "insert", "delete"]) {
    q[m] = (...args: unknown[]) => {
      if (record) serviceCalls.push({ table, method: m, args });
      return q;
    };
  }
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: () => ({ data: { user: { id: PLAYER } } }) },
    from: (table: string) => chain(table, pop(serverQueues, table), false),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "players") {
        return chain(table, { data: { is_blocked: false }, error: null }, false);
      }
      if (table === "notifications") {
        return chain(table, { data: [], error: null }, false);
      }
      return chain(table, pop(serviceQueues, table), true);
    },
    storage: { from: () => ({ upload, remove }) },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  requestGameAccount,
  sendChatImage,
  submitDeposit,
} from "../_actions";

function pngForm(extra: Record<string, string> = {}) {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const form = new FormData();
  form.set("screenshot", new File([png], "test.png", { type: "image/png" }));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return form;
}

describe("player sibling cleanup (M4/M11)", () => {
  beforeAll(() => {
    process.env.GAME_CREDS_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterAll(() => {
    delete process.env.GAME_CREDS_KEY;
  });
  beforeEach(() => {
    for (const k of Object.keys(serverQueues)) delete serverQueues[k];
    for (const k of Object.keys(serviceQueues)) delete serviceQueues[k];
    serviceCalls.length = 0;
    upload.mockReset();
    remove.mockReset();
    upload.mockImplementation(async (path: string) => ({
      data: { path },
      error: null,
    }));
    remove.mockResolvedValue({ data: [], error: null });
  });

  it("a failed account card rolls back the just-created account", async () => {
    serverQueues["game_accounts"] = [
      { data: null, error: null }, // no existing account
      { data: { id: "acc-1" }, error: null }, // account insert
    ];
    serviceQueues["games"] = [
      { data: [{ id: "juwa", name: "Juwa" }], error: null },
    ];
    serviceQueues["chat_messages"] = [
      { data: { id: "note-1" }, error: null }, // setup note
      { data: null, error: { message: "db down" } }, // card fails
      { data: [], error: null }, // note delete
    ];
    await expect(requestGameAccount("juwa")).rejects.toThrow(
      "Could not send account card",
    );
    expect(
      serviceCalls.filter(
        (c) => c.table === "game_accounts" && c.method === "delete",
      ),
    ).toHaveLength(1);
    expect(
      serviceCalls.filter(
        (c) => c.table === "chat_messages" && c.method === "delete",
      ),
    ).toHaveLength(1);
  });

  it("a failed deposit insert removes the uploaded screenshot", async () => {
    serviceQueues["payment_methods"] = [
      { data: [{ id: "cashapp", name: "Cash App" }], error: null },
    ];
    serverQueues["deposits"] = [
      { data: null, error: { message: "db down" } },
    ];
    const res = await submitDeposit(
      pngForm({ amount: "50", methodId: "cashapp" }),
    );
    expect(res).toEqual({
      ok: false,
      error: "Couldn't record the deposit. Try again.",
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0][0]).toEqual([upload.mock.calls[0][0]]);
  });

  it("a failed chat-image insert removes the uploaded screenshot", async () => {
    serviceQueues["chat_messages"] = [
      { data: null, error: { message: "db down" } },
    ];
    const res = await sendChatImage(pngForm());
    expect(res).toEqual({
      ok: false,
      error: "Couldn't send the image. Try again.",
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0][0]).toEqual([upload.mock.calls[0][0]]);
  });
});
