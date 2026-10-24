import { describe, expect, it } from "vitest";

import { isSafeHttpUrl, safeHref } from "../urls";

describe("isSafeHttpUrl", () => {
  it("accepts https and http URLs", () => {
    expect(isSafeHttpUrl("https://cash.app/$PlayVaultPay")).toBe(true);
    expect(isSafeHttpUrl("http://example.com/x")).toBe(true);
  });

  it("accepts surrounding whitespace around a good URL", () => {
    expect(isSafeHttpUrl("  https://example.com  ")).toBe(true);
  });

  it("rejects javascript: in any casing", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("JaVaScRiPt:alert(1)")).toBe(false);
  });

  it("rejects parser-normalization tricks (tabs, newlines, leading space)", () => {
    expect(isSafeHttpUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl(" javascript:alert(1)")).toBe(false);
  });

  it("rejects data:, vbscript:, protocol-relative and scheme-less URLs", () => {
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("//evil.com/x")).toBe(false);
    expect(isSafeHttpUrl("cash.app/$PlayVaultPay")).toBe(false);
  });

  it("rejects empty, null and undefined", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
  });
});

describe("safeHref", () => {
  it("returns the trimmed URL when safe, else null", () => {
    expect(safeHref("  https://example.com/a  ")).toBe("https://example.com/a");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
