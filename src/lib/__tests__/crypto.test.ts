import { describe, expect, it } from "vitest";

import { generateGamePassword } from "../crypto";

/**
 * Short game passwords (8 chars, lowercase + digits, no ambiguous
 * characters): players type these into third-party game apps by hand,
 * so the format must be short and single-keyboard-layer.
 */

const ALLOWED = new Set("abcdefghijkmnpqrstuvwxyz23456789");

describe("generateGamePassword", () => {
  it("generates exactly 8 characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateGamePassword()).toHaveLength(8);
    }
  });

  it("uses only lowercase letters and digits (no case switching)", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateGamePassword();
      for (const ch of pw) {
        expect(ALLOWED.has(ch)).toBe(true);
      }
    }
  });

  it("never uses ambiguous characters", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateGamePassword();
      expect(pw).not.toMatch(/[01lLoOI]/);
    }
  });

  it("is random across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seen.add(generateGamePassword());
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
