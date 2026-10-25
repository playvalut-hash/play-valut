"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  decryptPassword,
  encryptPassword,
  generateGamePassword,
} from "@/lib/crypto";
import {
  insertGameAccountWithUniqueUsername,
  validateDepositAmount,
} from "@/lib/utils";
import { validateImageFile } from "@/lib/uploads";
import { CatalogCache } from "@/lib/catalog-cache";
import { matchChatIntent } from "@/lib/chat-intent";
import type {
  AccountCard,
  ChatMessage,
  Game,
  MessageKind,
  PaymentMethod,
} from "./_types";
import { isAdminOnlyMessage } from "./_types";

/* ── input schemas (PRD §7.5: zod on every server action input) ─────────── */

const gameIdSchema = z.string().trim().min(1).max(64);
const messageSchema = z.string().trim().min(1).max(2000);
const uuidSchema = z.string().uuid();
const pickSchema = z.object({
  messageId: uuidSchema,
  pickId: z.string().trim().min(1).max(64),
});

type ActionResult = { ok: true } | { ok: false; error: string };
type ChatSendResult = { ok: true; greeted: boolean } | { ok: false; error: string };

/* ── small helpers ───────────────────────────────────────────────────────── */

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Games + payment methods change rarely, yet they were re-queried on
// EVERY chat message / pick / deposit step (each ~0.3-1s from the DB).
// A 60-second in-memory cache (per warm server instance) removes those
// round trips from the hot path. Staleness contract (v2 Phase 2, audit
// M5): TTL *is* the invalidation — no signal can reach other Vercel
// instances, so an admin edit shows up for a player at most 60 s late
// and two players can briefly disagree. Failures are LOGGED (not
// silent) while stale rows still serve; a cold cache with a failed
// fetch returns [].
const CATALOG_TTL_MS = 60_000;
const gamesCache = new CatalogCache<Game>(CATALOG_TTL_MS, "games");
const methodsCache = new CatalogCache<PaymentMethod>(
  CATALOG_TTL_MS,
  "payment_methods",
);

async function fetchActiveGames(): Promise<Game[]> {
  return gamesCache.get(async () => {
    const service = createServiceClient();
    const { data, error } = await service
      .from("games")
      .select(
        "id, name, category, icon_path, link, web_link, access, first_bonus_pct, reg_bonus_pct, min_load, max_load, redeem_info, sort_order",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return { data: data as unknown as Game[] | null, error };
  });
}

async function fetchActiveMethods(): Promise<PaymentMethod[]> {
  return methodsCache.get(async () => {
    const service = createServiceClient();
    const { data, error } = await service
      .from("payment_methods")
      .select(
        "id, name, brand_color, account_name, handle, pay_link, note, sort_order",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return { data: data as unknown as PaymentMethod[] | null, error };
  });
}

/**
 * Find the game a player is talking about.
 * Exact normalized name/id wins; otherwise the single game whose name/id
 * appears inside the message; ties break to the longest name.
 */
function findGame(text: string, games: Game[]): Game | null {
  const t = normalizeName(text);
  if (!t) return null;
  const exact = games.find(
    (g) => normalizeName(g.name) === t || normalizeName(g.id) === t,
  );
  if (exact) return exact;
  const contained = games.filter(
    (g) => t.includes(normalizeName(g.name)) || t.includes(normalizeName(g.id)),
  );
  if (contained.length === 0) return null;
  return contained.sort(
    (a, b) => normalizeName(b.name).length - normalizeName(a.name).length,
  )[0];
}

// Reports its result instead of swallowing it (v2 Phase 2, player
// siblings of audit M4): most callers only lose a message on failure
// and intentionally ignore the return, but deliverAccount's created
// path must roll back the just-made account when its note/card fails.
async function insertSystemMessage(
  playerId: string,
  kind: MessageKind,
  body: Record<string, unknown>,
): Promise<{ id: string | null; error: unknown }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("chat_messages")
    .insert({
      player_id: playerId,
      sender: "system",
      kind,
      body,
      is_read_by_admin: true,
      is_read_by_player: false,
    })
    .select("id")
    .single();
  return { id: (data as { id: string } | null)?.id ?? null, error };
}

async function notifyAdmin(
  kind: "message" | "account_request" | "deposit",
  playerId: string,
  preview: string,
  refId?: string,
): Promise<void> {
  const service = createServiceClient();
  await service.from("notifications").insert({
    kind,
    player_id: playerId,
    ref_id: refId ?? null,
    preview: preview.slice(0, 90),
  });
}

/* ── accounts (R1: one player + one game = one account) ──────────────────── */

/**
 * Create the player's account for a game, or return the saved one.
 * Uses the RLS-scoped client so the player can only ever touch their own row;
 * encryption happens server-side before insert.
 */
async function createOrReturnAccount(
  playerId: string,
  gameId: string,
): Promise<{ accountId: string; status: "creating" | "active"; created: boolean }> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("game_accounts")
    .select("id, status")
    .eq("player_id", playerId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (existing) {
    const row = existing as { id: string; status: "creating" | "active" };
    return { accountId: row.id, status: row.status, created: false };
  }

  // Username collisions with OTHER players are retried inside the helper
  // (audit H6): the (game_id, username) unique index (migration 0016)
  // surfaces them as 23505, and the helper regenerates the username.
  const inserted = await insertGameAccountWithUniqueUsername(gameId, {
    tryInsert: async (username) => {
      const { data, error } = await supabase
        .from("game_accounts")
        .insert({
          player_id: playerId,
          game_id: gameId,
          username,
          password_enc: encryptPassword(generateGamePassword()),
          status: "creating",
        })
        .select("id")
        .single();
      return {
        id: (data as { id: string } | null)?.id ?? null,
        errorCode: (error as { code?: string } | null)?.code ?? null,
      };
    },
    findExisting: async () => {
      const { data: retry } = await supabase
        .from("game_accounts")
        .select("id, status")
        .eq("player_id", playerId)
        .eq("game_id", gameId)
        .maybeSingle();
      return (retry as { id: string; status: "creating" | "active" } | null) ?? null;
    },
  });
  if (!inserted) {
    throw new Error("Could not create your game account. Please try again.");
  }
  return {
    accountId: inserted.id,
    status: inserted.status,
    created: inserted.created,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Best-effort "agent is typing…" on the player's chat while the next message
 * is prepared (Build 56 — human pacing). Decoration only; failures ignored.
 */
async function broadcastAgentTyping(playerId: string): Promise<void> {
  try {
    await createServiceClient()
      .channel(`typing:${playerId}`)
      .send({ type: "broadcast", event: "typing", payload: { from: "admin" } });
  } catch {
    /* typing is decoration — never break the flow */
  }
}

/**
 * Deliver an account through chat: setup note first, then the credential card.
 * Existing accounts return the saved card — never a duplicate (R1, R2).
 */
async function deliverAccount(playerId: string, game: Game): Promise<void> {
  const { accountId, status, created } = await createOrReturnAccount(playerId, game.id);

  if (!created) {
    // Account exists: surface the saved card again (well-formatted card,
    // same component as a new account — not a duplicate account, just
    // the card message at this point in the thread), then the
    // player-only note. The admin-only discussion note + bell follow in
    // the active branch below; each side's read path filters the other
    // side's note out, so each side sees only its own relevant message.
    await insertSystemMessage(playerId, "account", {
      game_id: game.id,
      account_id: accountId,
      status,
    });
    await insertSystemMessage(playerId, "player_note", {
      text: "Your account is already active.",
    });
    // Already-created AND active: the admin must be told, not just shown
    // a card. This path used to ring no bell at all — unlike a new
    // request, no notification row was created, so the admin saw nothing
    // but a picked state change. Now: bell notification + an explicit
    // message in the thread for discussion. (Creating accounts skip
    // this — they are still on their way, not "already active".)
    if (status === "active") {
      const service = createServiceClient();
      const { data: playerRow } = await service
        .from("players")
        .select("display_name")
        .eq("id", playerId)
        .maybeSingle();
      const name =
        (playerRow as { display_name?: string | null } | null)?.display_name ??
        "A player";
      await notifyAdmin(
        "account_request",
        playerId,
        `${name} picked ${game.name} (already active) — needs discussion`,
        accountId,
      );
      await insertSystemMessage(playerId, "admin_note", {
        text: `${name} want to play this game that already created and active please further discuss them!`,
      });
    }
    return;
  }

  await notifyAdmin("account_request", playerId, `Account requested: ${game.name}`, accountId);
  // Checked writes + rollback (v2 Phase 2, player sibling of audit M4):
  // a failed note/card used to succeed silently, leaving an orphan
  // "creating" account with no card. Any failure now removes the note
  // (if it landed) and the just-created account, then surfaces.
  // The !created path above needs no rollback — that account pre-existed.
  let noteId: string | null = null;
  try {
    const note = await insertSystemMessage(playerId, "text", {
      text: `On it! Getting your ${game.name} account ready — give me just a sec 👍`,
    });
    if (note.error || !note.id) throw new Error("Could not send setup note");
    noteId = note.id;
    // Human pacing (Build 56): the card must NOT land in the same instant as
    // the "On it!" note — a real agent takes a beat. Typing dots show on the
    // player's side while the card is "prepared"; the card lands ~1.2s later.
    void broadcastAgentTyping(playerId);
    await sleep(1200);
    const card = await insertSystemMessage(playerId, "account", {
      game_id: game.id,
      account_id: accountId,
      status: "creating",
    });
    if (card.error) throw new Error("Could not send account card");
  } catch (err) {
    const service = createServiceClient();
    if (noteId) {
      await service.from("chat_messages").delete().eq("id", noteId);
    }
    await service.from("game_accounts").delete().eq("id", accountId);
    throw err;
  }
}

/**
 * "Generate my account" from a game detail page.
 * New account → setup note + Creating… card in chat, then straight to
 * My Game Accounts (F7). Existing → saved card, no duplicate (R1).
 */
export async function requestGameAccount(rawGameId: string): Promise<void> {
  const parsed = gameIdSchema.safeParse(rawGameId);
  if (!parsed.success) redirect("/app");
  const gameId = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Blocked players cannot request accounts (v2 Phase 1, audit H11) —
  // the app shell also locks them out, but it fails open on a lookup
  // hiccup, so the action must enforce it itself. Redirecting to /app
  // lands on the shell's blocked screen.
  if (await isPlayerBlocked(user.id)) redirect("/app");

  const games = await fetchActiveGames();
  const game = games.find((g) => g.id === gameId);
  if (!game) redirect("/app");

  await deliverAccount(user.id, game);
  redirect("/app/accounts");
}

/** Sign out of the player app. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Guest lifecycle (migration 0031): an explicitly logged-out guest
  // vanishes from the admin inbox at once (guest_left_at), and the
  // sweep deletes their rows 24h later. Service client, so the C3
  // trigger's user-JWT guard never sees this write. Fail-soft: logout
  // itself must never break because the marker failed.
  if (user?.is_anonymous) {
    try {
      await createServiceClient()
        .from("players")
        .update({ guest_left_at: new Date().toISOString() })
        .eq("id", user.id);
    } catch {
      // Marker missed — the 24h idle sweep still catches this guest.
    }
  }
  await supabase.auth.signOut();
  redirect("/login");
}

/* ── menu notifications: mark-as-read watermark (migration 0025) ─────── */

/** Mark the player's currently-visible updates as read. Opening the
 *  Notifications section calls this: everything decided/activated up to
 *  now is dismissed, and only newer updates appear afterwards. The
 *  watermark is the newest visible update time (not "now"), so an
 *  update created mid-call is never wrongly dismissed.
 *
 *  Returns (never throws) a result: thrown action errors surface in
 *  production as a minified React digest instead of the message, so a
 *  user-facing explanation must travel as data. */
export async function markUpdatesRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const service = createServiceClient();
  const [{ data: deposits }, { data: accounts }] = await Promise.all([
    service
      .from("deposits")
      .select("decided_at")
      .eq("player_id", user.id)
      .not("decided_at", "is", null),
    service
      .from("game_accounts")
      .select("activated_at")
      .eq("player_id", user.id)
      .eq("status", "active")
      .not("activated_at", "is", null),
  ]);
  const times = [
    ...((deposits ?? []) as Array<{ decided_at: string }>).map((d) =>
      new Date(d.decided_at).getTime(),
    ),
    ...((accounts ?? []) as Array<{ activated_at: string }>).map((a) =>
      new Date(a.activated_at).getTime(),
    ),
  ].filter((t) => Number.isFinite(t));
  if (times.length === 0) return { ok: true };
  const seenAt = new Date(Math.max(...times)).toISOString();
  const { error } = await service
    .from("players")
    .update({ updates_seen_at: seenAt })
    .eq("id", user.id);
  if (error) {
    if (/updates_seen_at/.test(error.message ?? "")) {
      return {
        ok: false,
        error:
          "Notifications need migration 0025 — please run it in the SQL Editor first.",
      };
    }
    return { ok: false, error: "Could not mark notifications as read" };
  }
  return { ok: true };
}

/* ── blocking (Build 43) ─────────────────────────────────────────────────── */

async function isPlayerBlocked(userId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("players")
    .select("is_blocked")
    .eq("id", userId)
    .single();
  return data?.is_blocked === true;
}

/* ── chat ────────────────────────────────────────────────────────────────── */

const WARM_THANKS = [
  "You're very welcome! Anything else I can help with? 😊",
  "Anytime! Happy to help 🎮",
  "Of course! Let me know if you need anything else 👍",
];

function pickWarmThanks(): string {
  return WARM_THANKS[Math.floor(Math.random() * WARM_THANKS.length)];
}

const WARM_CLOSINGS = [
  "No problem at all! We're right here whenever you need a top-up or a new game 🎮",
  "Anytime! Just drop a message here when you need anything — good luck! 🍀",
  "Sounds good — we'll be here when you need us. Have fun! 🎉",
];

function pickWarmClosing(): string {
  return WARM_CLOSINGS[Math.floor(Math.random() * WARM_CLOSINGS.length)];
}

/**
 * Send a player chat message, notify the admin (every player message, R5),
 * and run the intent engine for the auto-reply.
 */
export async function sendChatMessage(
  rawText: string,
  sessionGreeted: boolean,
): Promise<ChatSendResult> {
  const parsed = messageSchema.safeParse(rawText);
  if (!parsed.success) return { ok: false, error: "Message is empty." };
  const text = parsed.data;

  const supabase = await createClient();
  // Auth + catalog fetch in parallel (independent round trips).
  const [authRes, games] = await Promise.all([
    supabase.auth.getUser(),
    fetchActiveGames(),
  ]);
  const user = authRes.data.user;
  if (!user) return { ok: false, error: "You're signed out. Please sign in again." };

  // Ensure players row exists (agents/admins don't have one; creates on demand).
  await supabase.from("players").upsert(
    {
      id: user.id,
      display_name:
        (user.user_metadata?.display_name as string) ||
        user.email?.split("@")[0] ||
        `Guest-${user.id.slice(0, 4)}`,
      email: user.email ?? null,
    },
    { onConflict: "id" },
  );

  // Blocked players cannot send (Build 43) — the app shell also locks
  // them out, this is the server-side enforcement.
  if (await isPlayerBlocked(user.id)) {
    return {
      ok: false,
      error: "Your account has been blocked. Please contact support.",
    };
  }

  // 1. The player's message (RLS: sender='player' only).
  const { error: msgError } = await supabase.from("chat_messages").insert({
    player_id: user.id,
    sender: "player",
    kind: "text",
    body: { text },
    is_read_by_admin: false,
    is_read_by_player: true,
  });
  if (msgError) return { ok: false, error: "Couldn't send. Try again." };

  // 2. Admin is notified of EVERY player message (R5).
  await notifyAdmin("message", user.id, text);

  // 3. Intent engine.
  let intent = matchChatIntent(text, games.map((g) => g.name));
  // "play juwa" names a game → that's an account request, not the games list.
  if (intent === "games_list" && findGame(text, games)) {
    intent = "account_request";
  }

  switch (intent) {
    case "games_list": {
      await insertSystemMessage(user.id, "games_list", {
        title: "Pick a game to get your account",
        games: games.map((g) => ({ id: g.id, name: g.name })),
        picked: null,
      });
      break;
    }
    case "account_request": {
      const game = findGame(text, games);
      if (!game) {
        await insertSystemMessage(user.id, "games_list", {
          title: "Which game would you like an account for?",
          games: games.map((g) => ({ id: g.id, name: g.name })),
          picked: null,
        });
      } else {
        await deliverAccount(user.id, game);
      }
      break;
    }
    case "deposit": {
      const methods = await fetchActiveMethods();
      await insertSystemMessage(user.id, "pay_list", {
        title: "Choose how you'd like to pay",
        methods: methods.map((m) => ({
          id: m.id,
          name: m.name,
          handle: m.handle,
          brand_color: m.brand_color,
        })),
        picked: null,
      });
      break;
    }
    case "thanks": {
      // R5: warm text only — no game list.
      await insertSystemMessage(user.id, "text", { text: pickWarmThanks() });
      break;
    }
    case "closing": {
      // Player is wrapping up ("no thank you", "that's all", "bye"):
      // a warm sign-off — never another "you're welcome" loop.
      await insertSystemMessage(user.id, "text", { text: pickWarmClosing() });
      break;
    }
    case "greeting": {
      // Warm reply + game chips once per session, then silent.
      if (!sessionGreeted) {
        await insertSystemMessage(user.id, "text", {
          text: "Hey! Welcome to PlayVault 🎮 What game are you looking to play today?",
        });
        await insertSystemMessage(user.id, "games_list", {
          title: "Tap a game to get your account",
          games: games.map((g) => ({ id: g.id, name: g.name })),
          picked: null,
        });
        return { ok: true, greeted: true };
      }
      break;
    }
    case "cashout": {
      // No auto-flow — an agent handles it manually.
      await insertSystemMessage(user.id, "text", {
        text: "Got you! For cashouts I'll have one of our agents help you out personally — just a moment while I get them 👍",
      });
      break;
    }
    case "silent":
    default:
      break;
  }

  return { ok: true, greeted: false };
}

/**
 * Player picks an item from a games_list / pay_list message.
 * Games → create-or-return account (R1). Payment method → payment card.
 */
export async function chatPick(
  rawMessageId: string,
  rawPickId: string,
): Promise<ActionResult> {
  const parsed = pickSchema.safeParse({ messageId: rawMessageId, pickId: rawPickId });
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  const { messageId, pickId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Please sign in again." };
  if (await isPlayerBlocked(user.id)) {
    return { ok: false, error: "Your account has been blocked. Please contact support." };
  }

  const { data: msgRow } = await supabase
    .from("chat_messages")
    .select("id, kind, body")
    .eq("id", messageId)
    .eq("player_id", user.id)
    .maybeSingle();
  if (!msgRow) return { ok: false, error: "Message not found." };
  const msg = msgRow as unknown as { id: string; kind: MessageKind; body: Record<string, unknown> };
  if (msg.kind !== "games_list" && msg.kind !== "pay_list") {
    return { ok: false, error: "This message can't be picked from." };
  }
  if (msg.body["picked"]) return { ok: true }; // already picked — no-op

  const service = createServiceClient();

  if (msg.kind === "games_list") {
    const games = await fetchActiveGames();
    const game = games.find((g) => g.id === pickId);
    if (!game) return { ok: false, error: "Unknown game." };
    await deliverAccount(user.id, game);
  } else {
    const methods = await fetchActiveMethods();
    const method = methods.find((m) => m.id === pickId);
    if (!method) return { ok: false, error: "Unknown payment method." };
    await insertSystemMessage(user.id, "payment_card", {
      payment_method_id: method.id,
      snapshot: {
        name: method.name,
        account_name: method.account_name,
        brand_color: method.brand_color,
        handle: method.handle,
        note: method.note,
        pay_link: method.pay_link,
      },
    });
  }

  await service
    .from("chat_messages")
    .update({
      body: { ...msg.body, picked: { id: pickId, at: new Date().toISOString() } },
    })
    .eq("id", messageId);

  return { ok: true };
}

/** Full thread for the signed-in player (oldest → newest). */
export async function getThread(): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("chat_messages")
    .select("id, player_id, sender, kind, body, is_read_by_admin, is_read_by_player, created_at")
    .eq("player_id", user.id)
    // LATEST 500, not the OLDEST 500 (Build 42) — see chat/page.tsx.
    // Secondary id order makes the window boundary deterministic, so
    // the getThreadOlder cursor never skips or repeats a tied row.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);
  // Side-specific notes (see _types): the admin's discussion note never
  // reaches the player app.
  return ((data ?? []) as unknown as ChatMessage[])
    .filter((m) => !isAdminOnlyMessage(m))
    .reverse();
}

const threadOlderCursorSchema = z.object({
  beforeCreatedAt: z.string().datetime({ offset: true }),
  beforeId: z.string().uuid(),
});

/**
 * One older page of the player's own thread (v2 Phase 2, audit M3).
 * Cursor is the oldest message currently shown; (created_at, id)
 * ordering keeps same-timestamp ties exact. Limit+1 reports hasMore
 * exactly. Invalid cursor or no user yields an empty page (same
 * fail-soft shape as getAccountCard's null).
 */
export async function getThreadOlder(
  rawCursor: z.input<typeof threadOlderCursorSchema>,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const parsed = threadOlderCursorSchema.safeParse(rawCursor);
  if (!parsed.success) return { messages: [], hasMore: false };
  const { beforeCreatedAt, beforeId } = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { messages: [], hasMore: false };
  const { data } = await supabase
    .from("chat_messages")
    .select("id, player_id, sender, kind, body, is_read_by_admin, is_read_by_player, created_at")
    .eq("player_id", user.id)
    .or(
      `created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`,
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(201);
  const rows = ((data ?? []) as unknown as ChatMessage[]).slice();
  const hasMore = rows.length > 200;
  const page = hasMore ? rows.slice(0, 200) : rows;
  // Side-specific notes (see _types): the admin's discussion note never
  // reaches the player app. hasMore stays computed on raw rows — there
  // are more rows below, just filtered from this page.
  return { messages: page.filter((m) => !isAdminOnlyMessage(m)).reverse(), hasMore };
}

/** Mark admin/system messages as read by the player. */
export async function markThreadRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // RPC (0009): players have no UPDATE policy on chat_messages — the
  // SECURITY DEFINER function flips only their own read flags.
  await supabase.rpc("mark_my_thread_read");
}

/**
 * Decrypt + return one account's credentials for its owner (R7).
 * RLS guarantees the row belongs to the signed-in player.
 */
export async function getAccountCard(rawAccountId: string): Promise<AccountCard | null> {
  const parsed = uuidSchema.safeParse(rawAccountId);
  if (!parsed.success) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Blocked players cannot view account cards (audit H11) — checked
  // before the row is even fetched, so no credential is decrypted.
  if (await isPlayerBlocked(user.id)) return null;

  const { data } = await supabase
    .from("game_accounts")
    .select("id, game_id, username, password_enc, status, game:games(id, name)")
    .eq("id", parsed.data)
    .eq("player_id", user.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    game_id: string;
    username: string;
    password_enc: string;
    status: "creating" | "active";
    game: { id: string; name: string } | null;
  };
  let password: string;
  try {
    password = decryptPassword(row.password_enc);
  } catch {
    return null;
  }
  return {
    accountId: row.id,
    gameId: row.game_id,
    gameName: row.game?.name ?? row.game_id,
    username: row.username,
    password,
    status: row.status,
  };
}

/** Short-lived signed URL for a screenshot the player owns. */
export async function getScreenshotUrl(rawPath: string): Promise<string | null> {
  const parsed = z.string().trim().min(1).max(500).safeParse(rawPath);
  if (!parsed.success) return null;
  const path = parsed.data.replace(/^screenshots\//, "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!path.startsWith(`${user.id}/`)) return null;
  const { data, error } = await supabase.storage
    .from("screenshots")
    .createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

/* ── deposits ────────────────────────────────────────────────────────────── */

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

function getFormFile(formData: FormData): File | null {
  const entry = formData.get("screenshot");
  return entry instanceof File && entry.size > 0 ? entry : null;
}

function getFormString(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

async function uploadScreenshot(userId: string, file: File): Promise<string> {
  const service = createServiceClient();
  const validated = await validateImageFile(file, MAX_SCREENSHOT_BYTES);
  const path = `${userId}/${crypto.randomUUID()}.${validated.extension}`;
  const { error } = await service.storage
    .from("screenshots")
    .upload(path, validated.bytes, {
      contentType: validated.contentType,
      upsert: false,
    });
  if (error) throw new Error("Couldn't upload the screenshot. Try again.");
  return path;
}

function validateDepositForm(
  amountRaw: string,
  methodId: string,
  file: File | null,
): string | null {
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return "Enter a valid amount.";
  const amountError = validateDepositAmount(amount);
  if (amountError) return amountError;
  if (!methodId) return "Pick a payment method.";
  if (!file) return "Attach your payment screenshot.";
  if (!file.type.startsWith("image/")) return "The screenshot must be an image.";
  if (file.size > MAX_SCREENSHOT_BYTES) return "Screenshot must be under 8 MB.";
  return null;
}

/**
 * Full deposit flow (deposit page): amount → method → pay → screenshot.
 * Uploads to the private screenshots bucket, inserts a pending deposit,
 * notifies the admin, and drops a system note in chat.
 */
export async function submitDeposit(formData: FormData): Promise<ActionResult> {
  const amountRaw = getFormString(formData, "amount");
  const methodId = getFormString(formData, "methodId");
  const file = getFormFile(formData);

  const formError = validateDepositForm(amountRaw, methodId, file);
  if (formError) return { ok: false, error: formError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Please sign in again." };

  if (await isPlayerBlocked(user.id)) {
    return { ok: false, error: "Your account has been blocked. Please contact support." };
  }

  const methods = await fetchActiveMethods();
  const method = methods.find((m) => m.id === methodId);
  if (!method) return { ok: false, error: "Unknown payment method." };

  let screenshotPath: string;
  try {
    screenshotPath = await uploadScreenshot(user.id, file as File);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }

  const amount = Number(amountRaw);
  const { error: depositError } = await supabase.from("deposits").insert({
    player_id: user.id,
    amount,
    payment_method_id: method.id,
    screenshot_path: screenshotPath,
    status: "pending",
  });
  if (depositError) {
    // Orphan cleanup (v2 Phase 2, player sibling of audit M11): the
    // screenshot is already in storage and nothing references it.
    await createServiceClient()
      .storage.from("screenshots")
      .remove([screenshotPath]);
    return { ok: false, error: "Couldn't record the deposit. Try again." };
  }

  await notifyAdmin("deposit", user.id, `Deposit $${amount} via ${method.name}`);
  await insertSystemMessage(user.id, "system", {
    text: `Deposit of $${amount} via ${method.name} submitted. Screenshot received — an agent will verify it shortly.`,
  });

  return { ok: true };
}

/**
 * Deposit started inside chat (pay_list → payment card → "I've paid").
 * Records the deposit and adds the screenshot as a chat `shot` message.
 */
export async function submitChatDeposit(formData: FormData): Promise<ActionResult> {
  const amountRaw = getFormString(formData, "amount");
  const methodId = getFormString(formData, "methodId");
  const file = getFormFile(formData);

  const formError = validateDepositForm(amountRaw, methodId, file);
  if (formError) return { ok: false, error: formError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Please sign in again." };

  if (await isPlayerBlocked(user.id)) {
    return { ok: false, error: "Your account has been blocked. Please contact support." };
  }

  const methods = await fetchActiveMethods();
  const method = methods.find((m) => m.id === methodId);
  if (!method) return { ok: false, error: "Unknown payment method." };

  let screenshotPath: string;
  try {
    screenshotPath = await uploadScreenshot(user.id, file as File);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }

  const amount = Number(amountRaw);
  const { error: depositError } = await supabase.from("deposits").insert({
    player_id: user.id,
    amount,
    payment_method_id: method.id,
    screenshot_path: screenshotPath,
    status: "pending",
  });
  if (depositError) {
    // Orphan cleanup (v2 Phase 2, player sibling of audit M11).
    await createServiceClient()
      .storage.from("screenshots")
      .remove([screenshotPath]);
    return { ok: false, error: "Couldn't record the deposit. Try again." };
  }

  const service = createServiceClient();
  await service.from("chat_messages").insert({
    player_id: user.id,
    sender: "player",
    kind: "shot",
    body: {
      screenshot_path: screenshotPath,
      caption: `Deposit $${amount} via ${method.name} — screenshot attached`,
    },
    is_read_by_admin: false,
    is_read_by_player: true,
  });
  // Player INSERTs bypass sender check via service client, but a notification
  // still goes out for the message so the admin sees it instantly.
  await notifyAdmin("deposit", user.id, `Deposit $${amount} via ${method.name}`);
  await notifyAdmin("message", user.id, `Deposit $${amount} via ${method.name} — screenshot attached`);

  return { ok: true };
}

/**
 * Send a plain image into the support chat (Build 58 — attach button /
 * paste). Same bucket + message shape as a deposit screenshot, but not
 * tied to any deposit.
 */
export async function sendChatImage(formData: FormData): Promise<ActionResult> {
  const file = getFormFile(formData);
  if (!file) return { ok: false, error: "No image selected." };
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That file isn't an image." };
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: "Image must be under 8 MB." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Please sign in again." };
  if (await isPlayerBlocked(user.id)) {
    return { ok: false, error: "Your account has been blocked. Please contact support." };
  }

  let screenshotPath: string;
  try {
    screenshotPath = await uploadScreenshot(user.id, file);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed.",
    };
  }

  const service = createServiceClient();
  const { error } = await service.from("chat_messages").insert({
    player_id: user.id,
    sender: "player",
    kind: "shot",
    body: { screenshot_path: screenshotPath, caption: "Image from player" },
    is_read_by_admin: false,
    is_read_by_player: true,
  });
  if (error) {
    // Orphan cleanup (v2 Phase 2, player sibling of audit M11).
    await createServiceClient()
      .storage.from("screenshots")
      .remove([screenshotPath]);
    return { ok: false, error: "Couldn't send the image. Try again." };
  }
  await notifyAdmin("message", user.id, "Sent an image in chat");
  return { ok: true };
}

/* ── Presence heartbeat (Build 63) ─────────────────────────────────────
 * Called by <PresenceHeartbeat/> while the app is open. The player id
 * always comes from the session, never from the client. Writes are
 * fail-soft: until migration 0013 (last_seen_at) is applied, the update
 * falls back to the is_online flag alone. */
export async function touchPresence(online: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const client = createServiceClient();
  const { error } = await client
    .from("players")
    .update({ is_online: online, last_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    await client
      .from("players")
      .update({ is_online: online })
      .eq("id", user.id);
  }
}

/* ── Guest device tracking (migration 0031) ─────────────────────────────
 * Called from <GuestBanner/> on mount. Sends the browser's localStorage
 * device id (a random UUID, not a hardware fingerprint) to the
 * track_guest_device RPC, which links the guest to its device row and
 * flags returning guests — so the admin inbox can show "this device
 * came before" even after the guest's own rows were swept. The IP is
 * read server-side from x-forwarded-for and only its SHA-256 hash is
 * stored. Tracking never breaks the app: every failure is swallowed. */
export async function trackGuestDevice(deviceKey: string): Promise<void> {
  try {
    if (!deviceKey.trim()) return;
    const forwarded = (await headers()).get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || null;
    const supabase = await createClient();
    await supabase.rpc("track_guest_device", {
      p_device_key: deviceKey.trim().slice(0, 128),
      p_ip: ip,
    });
  } catch {
    // Pre-migration (0031 not run) or transient — guest flow continues.
  }
}

/* ── Offers ticker (migration 0026) ──────────────────────────────────────
 * What the player layout renders: every LIVE offer (admin order) +
 * the global switch. Fails soft to "no ticker" on ANY error — before
 * migration 0026 runs, the tables don't exist and the player app must
 * keep working exactly as before. No caching here: an offer the admin
 * just added must show on the player's next page load — and the live
 * ticker (see _ticker-sync) refetches this on every realtime event,
 * so open pages update without any reload at all. Expired rows are
 * filtered here by server time, and again client-side by the sweep. */
export async function getTickerState(): Promise<{
  enabled: boolean;
  offers: Array<{ id: string; text: string; expiresAt: string | null }>;
}> {
  try {
    const service = createServiceClient();
    const settingsRes = await service
      .from("offer_settings")
      .select("ticker_enabled")
      .eq("id", 1)
      .maybeSingle();
    // Pre-0027 fallback: the table exists (0026 ran) but expires_at
    // does not — retry without that column instead of hiding a live
    // ticker until the admin runs the next migration. Rows from the
    // retry carry expires_at null (never expiring), which is exactly
    // the 0026 behaviour.
    let rowsRes = await service
      .from("offers")
      .select("id, text, is_active, sort_order, created_at, expires_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (rowsRes.error) {
      const legacy = await service
        .from("offers")
        .select("id, text, is_active, sort_order, created_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      rowsRes = {
        data: ((legacy.data ?? []) as Array<Record<string, unknown>>).map(
          (r) => ({ ...r, expires_at: null }),
        ),
        error: legacy.error,
      } as unknown as typeof rowsRes;
    }
    const { data: settings } = settingsRes;
    const { data: rows, error } = rowsRes;
    if (error) return { enabled: false, offers: [] };
    const enabled = settings
      ? (settings as { ticker_enabled: boolean }).ticker_enabled
      : true;
    const nowMs = Date.now();
    const live = ((rows ?? []) as Array<{
      id: string;
      text: string;
      is_active: boolean;
      sort_order: number;
      created_at: string;
      expires_at: string | null;
    }>).filter(
      (r) =>
        r.is_active &&
        (!r.expires_at || new Date(r.expires_at).getTime() > nowMs),
    );
    return {
      enabled,
      offers: live.map((r) => ({
        id: r.id,
        text: r.text,
        expiresAt: r.expires_at,
      })),
    };
  } catch {
    return { enabled: false, offers: [] };
  }
}
