import { describe, expect, it } from "vitest";

import {
  generateUsername,
  insertGameAccountWithUniqueUsername,
  slugPrefix,
} from "../utils";

describe("generateUsername shape", () => {
  it("is a lowercase prefix plus 6 digits", () => {
    expect(slugPrefix("Juwa!")).toBe("juwa");
    expect(generateUsername("Juwa")).toMatch(/^juwa\d{6}$/);
    expect(generateUsername("Fire Kirin")).toMatch(/^firekirin\d{6}$/);
  });
});

describe("insertGameAccountWithUniqueUsername (audit H6)", () => {
  it("regenerates the username on 23505 and succeeds", async () => {
    const tried: string[] = [];
    let calls = 0;
    const out = await insertGameAccountWithUniqueUsername("juwa", {
      tryInsert: async (username) => {
        tried.push(username);
        calls++;
        if (calls < 3) return { id: null, errorCode: "23505" };
        return { id: "acc-1", errorCode: null };
      },
      findExisting: async () => null,
    });
    expect(out).toEqual({ id: "acc-1", status: "creating", created: true });
    expect(tried).toHaveLength(3);
  });

  it("returns the existing row when the failure was a player+game race", async () => {
    const out = await insertGameAccountWithUniqueUsername("juwa", {
      tryInsert: async () => ({ id: null, errorCode: "23505" }),
      findExisting: async () => ({ id: "acc-old", status: "active" }),
    });
    expect(out).toEqual({ id: "acc-old", status: "active", created: false });
  });

  it("gives up after 10 collisions", async () => {
    let calls = 0;
    const out = await insertGameAccountWithUniqueUsername("juwa", {
      tryInsert: async () => {
        calls++;
        return { id: null, errorCode: "23505" };
      },
      findExisting: async () => null,
    });
    expect(out).toBeNull();
    expect(calls).toBe(10);
  });

  it("stops immediately on a non-unique error", async () => {
    let calls = 0;
    const out = await insertGameAccountWithUniqueUsername("juwa", {
      tryInsert: async () => {
        calls++;
        return { id: null, errorCode: "42501" };
      },
      findExisting: async () => null,
    });
    expect(out).toBeNull();
    expect(calls).toBe(1);
  });
});
