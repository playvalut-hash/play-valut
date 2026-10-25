/**
 * Chat intent matcher (PRD F8, F12, F13, Changes 3, 4, 9, 10, 13, 27).
 *
 * Handles typos + Roman Urdu. IMPORTANT guard: an exact game name
 * (e.g. "Game Vault") is ALWAYS an account request — never the games list.
 *
 * R5: unmatched messages → 'silent' (admin is still notified server-side).
 * R6: 'cashout' → no auto-flow; the message goes to the admin inbox for
 * manual handling.
 */

export type ChatIntent =
  | "games_list"
  | "account_request"
  | "deposit"
  | "thanks"
  | "closing"
  | "greeting"
  | "cashout"
  | "silent";

/** Normalize: lowercase, trim, collapse 3+ repeated letters (typo tolerance). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/(.)\1{2,}/g, "$1");
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Conversation closers — "no thank you", "that's all", goodbyes.
 * Checked BEFORE thanks on purpose: "no thank you" contains "thank",
 * but the player is ENDING the chat, not thanking again (Build 47).
 */
const CLOSING_PATTERNS: RegExp[] = [
  /\bno\s+(thank|thanks|thx)\b/,
  /\bthat'?s\s+all\b/,
  /\bnothing\s+(else|more)\b/,
  /\bno\s+(need|more)\b/,
  /\bi'?m\s+(good|done|all\s+set)\b/,
  /\ball\s+(set|good)\b/,
  /\bbye\b/,
  /\bgood\s?bye\b/,
  /allah\s+hafiz/,
  /khuda\s+hafiz/,
  /kuch\s+nahi\s+chahiye/,
  /nahi\s+chahiye/,
  /aur\s+kuch\s+nahi/,
  /\bho\s+gaya\b/,
];

const THANKS_PATTERNS: RegExp[] = [
  /\bthank(s| you)?\b/,
  /\bthx\b/,
  /shukriya/,
  /shukria/,
  /mehrbani/,
  /jazakallah/,
];

/**
 * Words that carry no content on their own — a thanks wrapped in
 * these is still just a thanks ("ok thank you", "thanks a lot").
 * Anything else left over means the player said something real
 * alongside the thanks.
 */
const THANKS_FILLERS = new Set([
  "ok",
  "okay",
  "yeah",
  "yes",
  "yup",
  "sure",
  "alright",
  "great",
  "good",
  "fine",
  "well",
  "oh",
  "ah",
  "hmm",
  "a",
  "lot",
  "so",
  "much",
  "very",
]);

/**
 * True when the message is ONLY a thanks (plus fillers/punctuation).
 * User rule (2026-10-25): thanks + other words → NO auto-reply at
 * all — the extra words are the real message (often a question, e.g.
 * "thank you, is it freeplay?"), and a canned "you're welcome" would
 * leave them unanswered. The admin is still notified of every
 * message, so a human answers instead.
 */
function isBareThanks(text: string): boolean {
  let rest = text;
  for (const p of THANKS_PATTERNS) {
    rest = rest.replace(new RegExp(p.source, "gi"), " ");
  }
  rest = rest.replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = rest.split(/\s+/).filter(Boolean);
  return words.length === 0 || words.every((w) => THANKS_FILLERS.has(w));
}

const GREETING_PATTERNS: RegExp[] = [
  /\bassalam/,
  /\bsalam\b/,
  /\baoa\b/,
  /\bhello\b/,
  /\bhey\b/,
  /\bhi\b/,
  /\badaab\b/,
  /\bsup\b/,
];

const CASHOUT_PATTERNS: RegExp[] = [
  /cash\s?out/,
  /withdraw/,
  /paisa\s+nikal/,
  /pese\s+nikal/,
  /paise\s+nikal/,
  /nikalwana/,
  /\bredeem\b/,
  /payout/,
];

const DEPOSIT_PATTERNS: RegExp[] = [
  /\bdeposit\b/,
  /depos[ie]t/,
  /pese\s+jama/,
  /paise\s+jama/,
  /paisa\s+jama/,
  /jama\s+kar/,
  /\bload\s+kar/,
  /recharge/,
  /add\s+(money|cash)/,
];

const ACCOUNT_PATTERNS: RegExp[] = [
  /ac+ount/,
  /\bid\b.*bana/,
  /bana\s?do/,
  /banao/,
  /naya\s+(account|id)/,
  /nayi\s+id/,
  /new\s+(account|id)/,
  /create.*account/,
  /account.*(chahiye|create|open)/,
  /game\s+chahiye/,
  /mujhe\s+game/,
  /open\s+(my\s+)?account/,
  /get\s+(a\s+|my\s+)?game\s+account/,
];

const GAMES_LIST_PATTERNS: RegExp[] = [
  /game\s*list/,
  /\bgames\b/,
  /\bkhel\b/,
  /sari\s+games?/,
  /saray\s+games?/,
  /all\s+games?/,
  /show.*games?/,
  /games?\s+dikhao/,
  /free\s?play/,
  /^play\b/,
  /\bplay\b.*list/,
];

/**
 * Match a player chat message to an intent.
 *
 * @param message   raw player message
 * @param gameNames canonical game names from the games table (e.g. "Game Vault")
 */
export function matchChatIntent(
  message: string,
  gameNames: string[],
): ChatIntent {
  const text = normalize(message);
  if (!text) return "silent";

  // IMPORTANT guard: exact game name → account request (never the games list).
  const loweredNames = gameNames.map((n) => normalize(n));
  if (loweredNames.includes(text)) return "account_request";

  if (matchesAny(text, CLOSING_PATTERNS)) return "closing";
  if (matchesAny(text, THANKS_PATTERNS)) {
    // Bare thanks → warm reply; thanks + other words → silent, so
    // the canned reply never swallows a real question (see isBareThanks).
    return isBareThanks(text) ? "thanks" : "silent";
  }
  if (matchesAny(text, CASHOUT_PATTERNS)) return "cashout";
  if (matchesAny(text, DEPOSIT_PATTERNS)) return "deposit";
  if (matchesAny(text, GREETING_PATTERNS)) return "greeting";
  if (matchesAny(text, ACCOUNT_PATTERNS)) return "account_request";
  if (matchesAny(text, GAMES_LIST_PATTERNS)) return "games_list";

  return "silent";
}
