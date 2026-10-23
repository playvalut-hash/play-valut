import { describe, expect, it } from "vitest";

import { expandShortcut, normalizeShortcutKey } from "../text-expander";

const MAP = new Map<string, string>([
  ["ty", "Thank you!"],
  ["lk", "Let me check that for you."],
  ["resolved", "Your issue is resolved.\nThanks for playing with us!"],
]);

describe("normalizeShortcutKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeShortcutKey("  TY ")).toBe("ty");
  });
  it("rejects spaces and symbols", () => {
    expect(normalizeShortcutKey("t y")).toBeNull();
    expect(normalizeShortcutKey("ty!")).toBeNull();
    expect(normalizeShortcutKey("")).toBeNull();
  });
  it("allows digits, dash and underscore after the first char", () => {
    expect(normalizeShortcutKey("dep-2_ok")).toBe("dep-2_ok");
  });
});

describe("expandShortcut", () => {
  it("expands a key followed by a space at the start", () => {
    const r = expandShortcut("ty ", 3, MAP);
    expect(r?.value).toBe("Thank you! ");
    expect(r?.cursor).toBe(11);
  });
  it("expands mid-sentence and keeps following text", () => {
    const r = expandShortcut("please ty now", 10, MAP);
    expect(r?.value).toBe("please Thank you! now");
  });
  it("is case-insensitive on the typed key", () => {
    expect(expandShortcut("TY ", 3, MAP)?.value).toBe("Thank you! ");
  });
  it("never fires inside a bigger word", () => {
    expect(expandShortcut("party ", 6, MAP)).toBeNull();
    expect(expandShortcut("misty ", 6, MAP)).toBeNull();
  });
  it("ignores unknown keys and non-space triggers", () => {
    expect(expandShortcut("zz ", 3, MAP)).toBeNull();
    expect(expandShortcut("ty", 2, MAP)).toBeNull();
    expect(expandShortcut("ty.", 3, MAP)).toBeNull();
  });
  it("supports multiline expansions and keeps the cursor after them", () => {
    const r = expandShortcut("resolved ", 9, MAP);
    expect(r?.value).toBe(
      "Your issue is resolved.\nThanks for playing with us! ",
    );
    expect(r?.cursor).toBe(r?.value.length);
  });
});
