import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

/**
 * Audit M7: the safe header baseline must ride on every route, and
 * HSTS must NOT be duplicated — Vercel already sends it.
 */
describe("security headers (audit M7)", () => {
  it("sets the safe baseline on every route, HSTS left to Vercel", async () => {
    const routes = await nextConfig.headers?.();
    const all = (routes ?? []).find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const map = new Map(
      (all?.headers ?? []).map((h) => [h.key, h.value]),
    );
    expect(map.get("X-Content-Type-Options")).toBe("nosniff");
    expect(map.get("X-Frame-Options")).toBe("DENY");
    expect(map.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(map.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(map.has("Strict-Transport-Security")).toBe(false);
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
