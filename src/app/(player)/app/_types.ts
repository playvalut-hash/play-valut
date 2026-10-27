/**
 * Player-app shared row types (cast from Supabase query results).
 * No Supabase generated types exist yet — keep these in sync with
 * supabase/migrations/0001_schema.sql.
 */

export interface Game {
  id: string;
  name: string;
  category: string | null;
  icon_path: string | null;
  /** Admin-uploaded override; when set it wins over icon_path everywhere. */
  custom_icon_path?: string | null;
  link: string | null;
  web_link: string | null;
  access: "both" | "app" | "web";
  first_bonus_pct: number;
  reg_bonus_pct: number;
  min_load: number | null;
  max_load: number | null;
  redeem_info: string | null;
  sort_order: number;
}

/** Column list for game lobby queries (shared so retries stay identical). */
export const GAMES_LIST_COLUMNS =
  "id, name, category, icon_path, link, web_link, access, first_bonus_pct, reg_bonus_pct, min_load, max_load, redeem_info, sort_order";
export const GAMES_LIST_COLUMNS_WITH_CUSTOM = `${GAMES_LIST_COLUMNS}, custom_icon_path`;

export interface GameAccount {
  id: string;
  game_id: string;
  username: string;
  status: "creating" | "active";
  created_at: string;
  game: {
    id: string;
    name: string;
    link: string | null;
    web_link: string | null;
    access: string | null;
  } | null;
}

export interface PaymentMethod {
  id: string;
  name: string;
  brand_color: string | null;
  account_name: string;
  handle: string;
  pay_link: string | null;
  note: string | null;
  sort_order: number;
}

export interface Deposit {
  id: string;
  /** Selected only where the amount is actually needed (never the wallet). */
  amount?: number;
  payment_method_id: string;
  screenshot_path: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  method: { name: string } | null;
}

export type MessageSender = "player" | "admin" | "system";
export type MessageKind =
  | "text"
  | "account"
  | "games_list"
  | "pay_list"
  | "payment_card"
  | "shot"
  | "system"
  // Side-specific notes (already-active picks): a note only its own side
  // may see. Read paths filter the other side's kind out (plus the
  // legacy kind="text" wordings below, which predate these kinds).
  | "player_note"
  | "admin_note"
  // Guest activation card (migration 0033): body {url}, rendered as a
  // gold card with a real "Activate account" button.
  | "activate";

/**
 * True when a thread row must NOT reach the player app: the admin's
 * discussion note, new kind or legacy wording. Callers filter with this
 * after fetching (one mechanism for new + legacy rows).
 */
export function isAdminOnlyMessage(m: {
  kind: string;
  sender: string;
  body: Record<string, unknown>;
}): boolean {
  if (m.kind === "admin_note") return true;
  if (m.kind !== "text" || m.sender !== "system") return false;
  const text = typeof m.body["text"] === "string" ? m.body["text"] : "";
  return text.includes(
    "that already created and active please further discuss them!",
  );
}

export interface ChatMessage {
  id: string;
  player_id: string;
  sender: MessageSender;
  kind: MessageKind;
  body: Record<string, unknown>;
  is_read_by_admin: boolean;
  is_read_by_player: boolean;
  created_at: string;
}

export interface AccountCard {
  accountId: string;
  gameId: string;
  gameName: string;
  username: string;
  password: string;
  status: "creating" | "active";
}

/** Gradient fallback per game (from seed data) until licensed artwork uploads. */
export const GAME_GRADIENTS: Record<string, [string, string]> = {
  juwa: ["#7a1f1f", "#c8451b"],
  juwa2: ["#5c1a2e", "#a8324f"],
  orion: ["#0c2d4d", "#1565a8"],
  fire: ["#5c1408", "#d35400"],
  panda: ["#123524", "#1e7a4c"],
  spin: ["#3a1150", "#7a2ea0"],
  milky: ["#241a4d", "#5b3ea8"],
  vault: ["#3d2c07", "#9a7414"],
  river: ["#10334d", "#1b7a8c"],
  frenzy: ["#0d3b2a", "#12996a"],
  vegas: ["#4d0f2d", "#a3135c"],
  mafia: ["#1c1c22", "#4a4a58"],
  cashm: ["#0d3b3b", "#128080"],
  yolo: ["#4d3208", "#b87a14"],
  allin: ["#0f2d3d", "#1b6a8c"],
  roll: ["#33124d", "#6a2ea0"],
  mega: ["#4d1a08", "#b85c14"],
  thunder: ["#12294d", "#1e5aa8"],
};

export function gameGradient(gameId: string): [string, string] {
  return GAME_GRADIENTS[gameId] ?? ["#1c2333", "#3a4a6a"];
}
