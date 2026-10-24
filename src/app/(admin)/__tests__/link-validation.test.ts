import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit H1: payment-method pay links are validated at the server-action
 * boundary, so a stored `javascript:` URL can never reach the database —
 * and therefore never reach a player/admin anchor. (The https accept path
 * is covered by the urls unit tests; the DB-write step is intentionally
 * not exercised here because section revalidation needs a live Next
 * request context.)
 */

import { getUser, mockServiceClient, session } from "./mocks";

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mockServiceClient,
}));

import { upsertPaymentMethod } from "../_actions";

const BASE = {
  id: "cashapp",
  name: "Cash App",
  accountName: "PlayVault",
  handle: "$PlayVaultPay",
};

describe("upsertPaymentMethod link validation (audit H1)", () => {
  beforeEach(() => getUser.mockReset());

  it("rejects a javascript: pay link before any DB write", async () => {
    session("admin-1");
    await expect(
      upsertPaymentMethod("admin-1", { ...BASE, payLink: "javascript:alert(1)" }),
    ).rejects.toThrow("Link must start with http:// or https://");
  });

  it("rejects a data: pay link", async () => {
    session("admin-1");
    await expect(
      upsertPaymentMethod("admin-1", {
        ...BASE,
        payLink: "data:text/html,<script>alert(1)</script>",
      }),
    ).rejects.toThrow("Link must start with http:// or https://");
  });

  it("rejects a scheme-less pay link", async () => {
    session("admin-1");
    await expect(
      upsertPaymentMethod("admin-1", { ...BASE, payLink: "cash.app/$PlayVaultPay" }),
    ).rejects.toThrow("Link must start with http:// or https://");
  });
});
