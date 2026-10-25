import { describe, expect, it } from "vitest";
import { maskEmail } from "../email";

describe("maskEmail", () => {
  it("shows the first two characters and hides the rest", () => {
    expect(maskEmail("s9shigri@gmail.com")).toBe("s9****@gmail.com");
    expect(maskEmail("bilal@gmail.com")).toBe("bi****@gmail.com");
  });

  it("keeps the domain visible", () => {
    expect(maskEmail("player@outlook.com")).toBe("pl****@outlook.com");
  });

  it("handles very short local parts", () => {
    expect(maskEmail("a@x.com")).toBe("a****@x.com");
    expect(maskEmail("ab@x.com")).toBe("a****@x.com");
  });

  it("passes null through and leaves non-addresses alone", () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});
