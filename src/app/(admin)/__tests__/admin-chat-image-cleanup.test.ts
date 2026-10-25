import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit M11: adminSendChatImage uploads to storage BEFORE inserting
 * the message. A failed insert must remove the just-uploaded file —
 * its random path is referenced by nothing, so otherwise it sits in
 * the bucket forever. A failed cleanup must never mask the original
 * error.
 */

import { ADMIN_ROW, getUser, session } from "./mocks";

const upload = vi.fn();
const remove = vi.fn();
let insertError: unknown = null;

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "maybeSingle", "insert"]) {
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
        return chain({ data: ADMIN_ROW, error: null });
      }
      if (table === "chat_messages") {
        return chain({ data: [], error: insertError });
      }
      return chain({ data: [], error: null });
    },
    storage: { from: () => ({ upload, remove }) },
  }),
}));

import { adminSendChatImage } from "../_actions";

const PLAYER = "55555555-5555-5555-8555-555555555555";

function imageForm() {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const form = new FormData();
  form.set(
    "screenshot",
    new File([png], "test.png", { type: "image/png" }),
  );
  return form;
}

describe("adminSendChatImage orphan cleanup (audit M11)", () => {
  beforeEach(() => {
    getUser.mockReset();
    session("admin-1");
    upload.mockReset();
    remove.mockReset();
    insertError = null;
    upload.mockResolvedValue({ data: { path: "x" }, error: null });
    remove.mockResolvedValue({ data: [], error: null });
  });

  it("success leaves the upload in place", async () => {
    await adminSendChatImage("admin-1", PLAYER, imageForm());
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it("a failed message insert removes the uploaded file", async () => {
    insertError = { message: "db down" };
    await expect(
      adminSendChatImage("admin-1", PLAYER, imageForm()),
    ).rejects.toThrow("Couldn't send the image. Try again.");
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    const uploadedPath = upload.mock.calls[0][0] as string;
    expect(uploadedPath.startsWith(`${PLAYER}/`)).toBe(true);
    expect(remove.mock.calls[0][0]).toEqual([uploadedPath]);
  });

  it("a failed cleanup still surfaces the original error", async () => {
    insertError = { message: "db down" };
    remove.mockResolvedValue({ data: null, error: { message: "gone" } });
    await expect(
      adminSendChatImage("admin-1", PLAYER, imageForm()),
    ).rejects.toThrow("Couldn't send the image. Try again.");
    expect(remove).toHaveBeenCalledOnce();
  });

  it("a failed upload has nothing to clean up", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(
      adminSendChatImage("admin-1", PLAYER, imageForm()),
    ).rejects.toThrow("Couldn't upload the image. Try again.");
    expect(remove).not.toHaveBeenCalled();
  });
});
