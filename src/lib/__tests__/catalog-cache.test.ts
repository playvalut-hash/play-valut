import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogCache } from "../catalog-cache";

describe("CatalogCache (audit M5)", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => {
    errorSpy.mockClear();
  });

  it("caches within TTL and refetches after expiry", async () => {
    let now = 1_000_000;
    let calls = 0;
    const cache = new CatalogCache<string>(60_000, "games", () => now);
    const fetch = async () => {
      calls += 1;
      return { data: [`v${calls}`], error: null };
    };
    expect(await cache.get(fetch)).toEqual(["v1"]);
    expect(await cache.get(fetch)).toEqual(["v1"]);
    expect(calls).toBe(1);
    now += 60_001;
    expect(await cache.get(fetch)).toEqual(["v2"]);
    expect(calls).toBe(2);
  });

  it("logs failures and serves stale rows, retrying on the next call", async () => {
    let now = 1_000_000;
    const cache = new CatalogCache<string>(60_000, "games", () => now);
    await cache.get(async () => ({ data: ["warm"], error: null }));
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return { data: null, error: { message: "db down" } };
    };
    // Expire the warm entry first, or the failing fetch never runs.
    now += 60_001;
    expect(await cache.get(failing)).toEqual(["warm"]);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(String(errorSpy.mock.calls[0][0])).toContain("db down");
    expect(String(errorSpy.mock.calls[0][0])).toContain("staleServed\":true");
    // No timestamp refresh on failure: the next call retries immediately.
    now += 1;
    expect(await cache.get(failing)).toEqual(["warm"]);
    expect(calls).toBe(2);
  });

  it("logs failures and returns [] with a cold cache", async () => {
    const cache = new CatalogCache<string>(60_000, "methods", () => 1_000_000);
    expect(
      await cache.get(async () => ({
        data: null,
        error: { message: "db down" },
      })),
    ).toEqual([]);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(String(errorSpy.mock.calls[0][0])).toContain("staleServed\":false");
  });

  it("recovers: a later success replaces the stale rows", async () => {
    let now = 1_000_000;
    const cache = new CatalogCache<string>(60_000, "games", () => now);
    expect(await cache.get(async () => ({ data: ["old"], error: null }))).toEqual([
      "old",
    ]);
    // Failure inside TTL still serves stale; after expiry the next
    // success stores fresh rows.
    expect(
      await cache.get(async () => ({
        data: null,
        error: { message: "db down" },
      })),
    ).toEqual(["old"]);
    now += 60_001;
    expect(await cache.get(async () => ({ data: ["new"], error: null }))).toEqual([
      "new",
    ]);
    expect(await cache.get(async () => ({ data: ["nope"], error: null }))).toEqual([
      "new",
    ]);
  });
});
