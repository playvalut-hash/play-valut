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
 * e.g. "juwa777482910". Uniqueness is enforced DB-side (R1) — callers must
 * retry on unique-violation.
 */
export function generateUsername(gameSlug: string): string {
  return `${slugPrefix(gameSlug)}${randomDigits(6)}`;
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
