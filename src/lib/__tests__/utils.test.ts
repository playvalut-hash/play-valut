import { describe, expect, it } from "vitest";

import { escapeLikePattern } from "../utils";

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards and the escape character itself", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("leaves plain text untouched", () => {
    expect(escapeLikePattern("Ahmed")).toBe("Ahmed");
    expect(escapeLikePattern("")).toBe("");
  });
});
