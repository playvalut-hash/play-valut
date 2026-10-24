import { describe, expect, it } from "vitest";

import { mergeThreadMessages } from "../thread-merge";

type Msg = { id: string; created_at: string };
const at = (m: Msg) => m.created_at;
const msg = (id: string, created_at: string): Msg => ({ id, created_at });

describe("mergeThreadMessages (audit M3)", () => {
  it("returns fresh alone when the full history fits the window", () => {
    const prev = [msg("a", "2026-10-20T10:00:00Z")];
    const fresh = [msg("b", "2026-10-24T10:00:00Z")];
    expect(mergeThreadMessages(prev, fresh, 500, at)).toEqual(fresh);
  });

  it("keeps loaded older pages and lets fresh win on overlap", () => {
    const prev = [
      msg("old-1", "2026-10-20T10:00:00Z"),
      msg("old-2", "2026-10-21T10:00:00Z"),
      msg("w1", "2026-10-24T09:00:00Z"),
    ];
    const fresh = [
      msg("w1", "2026-10-24T09:00:00Z"), // same id: fresh wins (edit)
      msg("w2", "2026-10-24T10:00:00Z"),
      msg("w3", "2026-10-24T11:00:00Z"),
    ];
    expect(mergeThreadMessages(prev, fresh, 3, at)).toEqual([
      msg("old-1", "2026-10-20T10:00:00Z"),
      msg("old-2", "2026-10-21T10:00:00Z"),
      msg("w1", "2026-10-24T09:00:00Z"),
      msg("w2", "2026-10-24T10:00:00Z"),
      msg("w3", "2026-10-24T11:00:00Z"),
    ]);
  });

  it("drops rows deleted server-side (newer than window oldest, missing from fresh)", () => {
    const prev = [
      msg("old-1", "2026-10-20T10:00:00Z"),
      msg("gone", "2026-10-24T09:30:00Z"),
    ];
    const fresh = [
      msg("w1", "2026-10-24T09:00:00Z"),
      msg("w2", "2026-10-24T10:00:00Z"),
    ];
    expect(mergeThreadMessages(prev, fresh, 2, at)).toEqual([
      msg("old-1", "2026-10-20T10:00:00Z"),
      msg("w1", "2026-10-24T09:00:00Z"),
      msg("w2", "2026-10-24T10:00:00Z"),
    ]);
  });

  it("breaks created_at ties by id, matching Postgres ordering", () => {
    const prev = [msg("aaa", "2026-10-24T09:00:00Z")];
    const fresh = [
      msg("bbb", "2026-10-24T09:00:00Z"),
      msg("ccc", "2026-10-24T10:00:00Z"),
    ];
    expect(mergeThreadMessages(prev, fresh, 2, at)).toEqual([
      msg("aaa", "2026-10-24T09:00:00Z"),
      msg("bbb", "2026-10-24T09:00:00Z"),
      msg("ccc", "2026-10-24T10:00:00Z"),
    ]);
  });
});
