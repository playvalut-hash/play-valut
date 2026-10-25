import { describe, expect, it, vi } from "vitest";
import { resolveGameIconUrl } from "../game-icon";

vi.stubEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  "https://example.supabase.co",
);

describe("resolveGameIconUrl", () => {
  it("returns null when neither slot is set", () => {
    expect(resolveGameIconUrl(null, null)).toBeNull();
    expect(resolveGameIconUrl(undefined, undefined)).toBeNull();
  });

  it("passes full artwork URLs through untouched", () => {
    const url = "https://machinebreakershub.com/api/uploads/game-icons/hd-juwa2.webp";
    expect(resolveGameIconUrl(url, null)).toBe(url);
  });

  it("passes site-local paths through untouched", () => {
    expect(resolveGameIconUrl("/icons/games/juwa2.webp", null)).toBe(
      "/icons/games/juwa2.webp",
    );
  });

  it("expands a bare storage path to its public URL (the old player-site bug)", () => {
    expect(resolveGameIconUrl("juwa2.png", null)).toBe(
      "https://example.supabase.co/storage/v1/object/public/game-icons/juwa2.png",
    );
  });

  it("prefers the custom upload over the original everywhere", () => {
    expect(
      resolveGameIconUrl("https://example.com/original.webp", "custom.png"),
    ).toBe(
      "https://example.supabase.co/storage/v1/object/public/game-icons/custom.png",
    );
  });

  it("falls back to the original once the custom is cleared", () => {
    const original = "https://example.com/original.webp";
    expect(resolveGameIconUrl(original, null)).toBe(original);
    expect(resolveGameIconUrl(original, "")).toBe(original);
  });
});
