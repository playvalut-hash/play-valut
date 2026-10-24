/**
 * Tiny TTL cache for rarely-changing catalog data (v2 Phase 2, audit M5).
 *
 * The 60 s staleness is ACCEPTED, not a bug to fix: on Vercel each warm
 * server instance holds its own module-level cache, so no invalidation
 * signal can reach the other instances — an admin edit shows up for a
 * player at most TTL late, and two players can briefly disagree. A
 * database version check per fetch would cost the very round trip the
 * cache removes, so TTL *is* the invalidation.
 *
 * What M5 actually fixes is the SILENCE: a failed fetch used to serve
 * stale rows with no trace, hiding database outages from everyone.
 * Failures are now logged (Vercel logs) while stale rows still serve —
 * availability over freshness — and a cold cache with a failed fetch
 * returns [] (the only honest answer with nothing to serve). A failed
 * fetch never refreshes the timestamp, so the next call retries the
 * database immediately instead of backing off into stale data.
 */
export class CatalogCache<T> {
  private cached: { at: number; rows: T[] } | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly scope: string,
    private readonly now: () => number = Date.now,
  ) {}

  async get(
    fetch: () => Promise<{ data: T[] | null; error: unknown }>,
  ): Promise<T[]> {
    const now = this.now();
    if (this.cached && now - this.cached.at < this.ttlMs) {
      return this.cached.rows;
    }
    const { data, error } = await fetch();
    if (error || !data) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "unknown error";
      console.error(
        JSON.stringify({
          scope: "catalog",
          catalog: this.scope,
          error: message,
          staleServed: this.cached !== null,
          at: new Date(now).toISOString(),
        }),
      );
      return this.cached?.rows ?? [];
    }
    this.cached = { at: this.now(), rows: data };
    return data;
  }
}
