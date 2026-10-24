import { z } from "zod";

/**
 * Pure, unit-testable helpers. No DOM, no Next.js, no Supabase —
 * safe to import anywhere (client, server, tests).
 */

/** Join truthy class names. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/* ── Tags (PRD §3.7, Change 23) ─────────────────────────────────────────── */

/** Normalize a player tag: lowercase, trimmed, single-spaced. */
/**
 * Escapes a user string for use inside a Postgres LIKE/ILIKE pattern
 * (v2 Phase 1, audit H2): without this, a search for "100%" would match
 * every name, and "_" would match any single character.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, " ");
}

/* ── Bonus line (PRD R3 / R4, Changes 17, 21, 23) ────────────────────────── */

export type BonusSource = "tile" | "card" | "sheet";

export interface BonusGame {
  signupBonusPct: number;
  reloadBonusPct: number;
}

export interface BonusLineOpts {
  /**
   * Rendered on the main game tile? R4: bonus % shows ONLY on main tiles —
   * never on account rows/cards/sheets.
   */
  onTile?: boolean;
  /** Player carries the "paid" tag (compare with normalizeTag output). */
  isPaid?: boolean;
  /** The player's account for this game is Active (vs Creating). */
  isActive?: boolean;
}

function formatSignup(game: BonusGame): string {
  return `Signup +${game.signupBonusPct}%`;
}

export function formatReload(game: BonusGame): string {
  return `Reload +${game.reloadBonusPct}%`;
}

/**
 * The signup bonus line for a main game tile.
 *
 * Returns `null` when:
 *  - not rendered on the main tile (R4 — account cards never show bonuses), or
 *  - the player is tagged "Paid" AND the account is Active
 *    (R3 — signup bonus hidden everywhere for that account; only reload shows).
 */
export function bonusLine(
  game: BonusGame,
  opts: BonusLineOpts = {},
): string | null {
  const { onTile = true, isPaid = false, isActive = false } = opts;
  if (!onTile) return null;
  if (isPaid && isActive) return null;
  return formatSignup(game);
}

/** Full tile bonus text: "Signup +X% · Reload +Y%" (or just the reload part when R3 hides signup). */
export function tileBonusText(
  game: BonusGame,
  opts: BonusLineOpts = {},
): string {
  const signup = bonusLine(game, opts);
  return signup ? `${signup} · ${formatReload(game)}` : formatReload(game);
}

/* ── Username generation (Change 3) ─────────────────────────────────────── */

/** Letters/digits only, lowercase, max 10 chars — used as the username prefix. */
export function slugPrefix(gameSlug: string): string {
  const cleaned = gameSlug.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return cleaned.slice(0, 10) || "player";
}

function randomDigits(count: number): string {
  const values = new Uint32Array(count);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => String(v % 10)).join("");
}

/**
 * Generate a game account username: game prefix + 6 random digits,
 * e.g. "juwa777482910".
 *
 * CORRECTION (v2 Phase 1, audit H6): the old comment claimed uniqueness
 * was "enforced DB-side (R1)". Wrong on both halves: R1 is the
 * (player_id, game_id) constraint — one account per player per game — and
 * there was NO constraint on (game_id, username) at all, so two players
 * could receive the same game login. The (game_id, username) unique index
 * is migration 0016, and inserts MUST go through
 * insertGameAccountWithUniqueUsername below, which regenerates the
 * username on unique-violation (23505).
 */
export function generateUsername(gameSlug: string): string {
  return `${slugPrefix(gameSlug)}${randomDigits(6)}`;
}

export type GameAccountInsertOps = {
  /** One insert attempt. Returns the new row id, or the PostgREST code. */
  tryInsert: (username: string) => Promise<{
    id: string | null;
    errorCode: string | null;
  }>;
  /** Re-check for a (player_id, game_id) row after a failed insert. */
  findExisting: () => Promise<{
    id: string;
    status: "creating" | "active";
  } | null>;
};

/**
 * Insert a game account, regenerating the username on (game_id, username)
 * collisions (audit H6). Returns the new row, or the pre-existing row when
 * the failure was actually a (player_id, game_id) race, or null when the
 * insert cannot succeed (exhausted retries, or a non-unique error) — the
 * caller throws its own message in that case. The username space per game
 * is only 10^6 (6 digits), so collisions are a certainty at scale, not a
 * corner case: ~39% chance of at least one collision at 1,000 accounts
 * for one game (birthday paradox).
 */
export async function insertGameAccountWithUniqueUsername(
  gameSlug: string,
  ops: GameAccountInsertOps,
  maxAttempts = 10,
): Promise<
  | { id: string; status: "creating" | "active"; created: boolean }
  | null
> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { id, errorCode } = await ops.tryInsert(generateUsername(gameSlug));
    if (id) return { id, status: "creating", created: true };
    // Any failure: first check whether another request created this
    // player+game row meanwhile (the race the old code handled).
    const existing = await ops.findExisting();
    if (existing) return { ...existing, created: false };
    // A unique-violation with no such row means the USERNAME collided
    // with another player's account — regenerate and retry. Any other
    // error is real: stop and let the caller report it.
    if (errorCode !== "23505") return null;
  }
  return null;
}

/* ── Deposit amount validation (PRD §3.3) ───────────────────────────────── */

export const MIN_DEPOSIT = 1;
export const MAX_DEPOSIT = 5000;

export const depositAmountSchema = z
  .number({ error: "Amount must be a number" })
  .min(MIN_DEPOSIT, `Minimum deposit is $${MIN_DEPOSIT}`)
  .max(MAX_DEPOSIT, `Maximum deposit is $${MAX_DEPOSIT.toLocaleString()}`);

/**
 * Validate a deposit amount. Returns `null` when valid,
 * otherwise a human-readable error message.
 */
export function validateDepositAmount(amount: unknown): string | null {
  const result = depositAmountSchema.safeParse(amount);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Invalid amount";
}
