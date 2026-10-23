"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  decryptPassword,
  encryptPassword,
  generateGamePassword,
} from "@/lib/crypto";
import { generateUsername, validateDepositAmount } from "@/lib/utils";
import { matchChatIntent } from "@/lib/chat-intent";
import type {
  AccountCard,
  ChatMessage,
  Game,
  MessageKind,
  PaymentMethod,
} from "./_types";

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
// round trips from the hot path; admin edits show up within a minute.
const CATALOG_TTL_MS = 60_000;
let gamesCache: { at: number; rows: Game[] } | null = null;
let methodsCache: { at: number; rows: PaymentMethod[] } | null = null;

async function fetchActiveGames(): Promise<Game[]> {
  if (gamesCache && Date.now() - gamesCache.at < CATALOG_TTL_MS) {
    return gamesCache.rows;
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("games")
    .select(
      "id, name, category, icon_path, link, web_link, access, first_bonus_pct, reg_bonus_pct, min_load, max_load, redeem_info, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return gamesCache?.rows ?? [];
  const rows = data as unknown as Game[];
  gamesCache = { at: Date.now(), rows };
  return rows;
}

async function fetchActiveMethods(): Promise<PaymentMethod[]> {
  if (methodsCache && Date.now() - methodsCache.at < CATALOG_TTL_MS) {
    return methodsCache.rows;
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("payment_methods")
    .select(
      "id, name, brand_color, account_name, handle, pay_link, note, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return methodsCache?.rows ?? [];
  const rows = data as unknown as PaymentMethod[];
  methodsCache = { at: Date.now(), rows };
  return rows;
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

async function insertSystemMessage(
  playerId: string,
  kind: MessageKind,
  body: Record<string, unknown>,
): Promise<void> {
  const service = createServiceClient();
  await service.from("chat_messages").insert({
    player_id: playerId,
    sender: "system",
    kind,
    body,
    is_read_by_admin: true,
    is_read_by_player: false,
  });
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

  const { data, error } = await supabase
    .from("game_accounts")
    .insert({
      player_id: playerId,
      game_id: gameId,
      username: generateUsername(gameId),
      password_enc: encryptPassword(generateGamePassword()),
      status: "creating",
    })
    .select("id")
    .single();

  if (error || !data) {
    // Race: another request created it between our check and insert.
    const { data: retry } = await supabase
      .from("game_accounts")
      .select("id, status")
      .eq("player_id", playerId)
      .eq("game_id", gameId)
      .maybeSingle();
    if (retry) {
      const row = retry as { id: string; status: "creating" | "active" };
      return { accountId: row.id, status: row.status, created: false };
    }
    throw new Error("Could not create your game account. Please try again.");
  }
  return { accountId: (data as { id: string }).id, status: "creating", created: true };
}

/** Does an account card message for this account already exist in the thread? */
async function accountCardExists(
  playerId: string,
  accountId: string,
): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service
    .from("chat_messages")
    .select("id")
    .eq("player_id", playerId)
    .eq("kind", "account")
    .eq("body->>account_id", accountId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Deliver an account through chat: setup note first, then the credential card
 * (human pacing, F11). Existing accounts return the saved card — never a
 * duplicate (R1, R2).
 */
async function deliverAccount(playerId: string, game: Game): Promise<void> {
  const { accountId, status, created } = await createOrReturnAccount(playerId, game.id);

  if (!created) {
    const exists = await accountCardExists(playerId, accountId);
    if (exists) {
      await insertSystemMessage(playerId, "text", {
        text: `You already have a ${game.name} account — it's right here in our chat, and under Menu → My Game Accounts.`,
      });
      return;
    }
    // Account exists but was made from the lobby: surface the saved card.
    await insertSystemMessage(playerId, "account", {
      game_id: game.id,
      account_id: accountId,
      status,
    });
    return;
  }

  await notifyAdmin("account_request", playerId, `Account requested: ${game.name}`, accountId);
  await insertSystemMessage(playerId, "text", {
    text: `On it! Getting your ${game.name} account ready — give me just a sec 👍`,
  });
  await insertSystemMessage(playerId, "account", {
    game_id: game.id,
    account_id: accountId,
    status: "creating",
  });
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

  const games = await fetchActiveGames();
  const game = games.find((g) => g.id === gameId);
  if (!game) redirect("/app");

  await deliverAccount(user.id, game);
  redirect("/app/accounts");
}

/** Sign out of the player app. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
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
        "Player",
      email: user.email ?? null,
    },
    { onConflict: "id" },
  );

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
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as unknown as ChatMessage[]).reverse();
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
  const ext = file.type.includes("png") ? "png" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await service.storage
    .from("screenshots")
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
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
