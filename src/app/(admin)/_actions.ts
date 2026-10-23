/**
 * Admin server actions — the ONLY data-access path for the admin back office.
 *
 * Every action uses the service-role client (RLS bypass is intentional, PRD §5.2).
 * Every mutating action takes the acting admin's id and writes an audit line.
 * This file is server-only: never import it into a "use client" module directly
 * (client components import only the action functions, which Next proxies).
 */
"use server";

import { cache } from "react";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptPassword, encryptPassword } from "@/lib/crypto";
import { normalizeTag } from "@/lib/utils";
import { QUICK_REPLIES } from "./_quick-replies";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type AdminRole = "super_admin" | "agent";

/** Grantable staff permissions (Build 43). Super admin always has all. */
export type StaffPermissionKey = "player_block" | "chat_clear" | "player_delete";

export interface StaffPermissions {
  player_block: boolean;
  chat_clear: boolean;
  player_delete: boolean;
}

const NO_PERMISSIONS: StaffPermissions = {
  player_block: false,
  chat_clear: false,
  player_delete: false,
};

const ALL_PERMISSIONS: StaffPermissions = {
  player_block: true,
  chat_clear: true,
  player_delete: true,
};

function parsePermissions(raw: unknown, role: AdminRole): StaffPermissions {
  if (role === "super_admin") return { ...ALL_PERMISSIONS };
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    player_block: r.player_block === true,
    chat_clear: r.chat_clear === true,
    player_delete: r.player_delete === true,
  };
}

export interface AdminInfo {
  id: string;
  role: AdminRole;
  displayName: string;
  email: string;
  permissions: StaffPermissions;
}

export interface PlayerOverview {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  createdAt: string;
  tags: string[];
  unreadCount: number;
  pendingDeposits: number;
  creatingAccounts: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
}

export type ChatSender = "player" | "admin" | "system";
export type ChatKind =
  | "text"
  | "account"
  | "games_list"
  | "pay_list"
  | "payment_card"
  | "shot"
  | "system";

export interface ThreadAccountCard {
  gameId: string;
  accountId: string;
  status: "creating" | "active";
  gameName: string;
  username: string;
}

export interface ThreadPick {
  id: string;
  at: string;
}

export interface ChatMessageView {
  id: string;
  playerId: string;
  sender: ChatSender;
  kind: ChatKind;
  createdAt: string;
  text: string | null;
  account: ThreadAccountCard | null;
  listTitle: string | null;
  picked: ThreadPick | null;
  pickedName: string | null;
  paymentCard: {
    name: string;
    accountName: string | null;
    brandColor: string | null;
    handle: string;
    note: string | null;
    payLink: string | null;
  } | null;
  screenshotUrl: string | null;
  screenshotCaption: string | null;
  readByPlayer: boolean;
  readByAdmin: boolean;
}

export interface AdminNoteView {
  id: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AdminAccountView {
  id: string;
  gameId: string;
  gameName: string;
  username: string;
  status: "creating" | "active";
  createdAt: string;
  activatedAt: string | null;
}

export interface PendingDepositView {
  id: string;
  amount: string;
  methodName: string;
  screenshotUrl: string | null;
  createdAt: string;
}

export interface PlayerDetailView {
  player: {
    id: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    isOnline: boolean;
    isBlocked: boolean;
    blockedAt: string | null;
  };
  tags: string[];
  notes: AdminNoteView[];
  accounts: AdminAccountView[];
  pendingDeposits: PendingDepositView[];
}

export interface NotificationView {
  id: string;
  kind: "message" | "account_request" | "deposit";
  playerId: string;
  playerName: string;
  preview: string | null;
  createdAt: string;
}

export interface GameRow {
  id: string;
  name: string;
  category: string | null;
  iconPath: string | null;
  iconUrl: string | null;
  link: string | null;
  webLink: string | null;
  access: "both" | "app" | "web";
  firstBonusPct: number;
  regBonusPct: number;
  minLoad: string | null;
  maxLoad: string | null;
  redeemInfo: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface PaymentMethodRow {
  id: string;
  name: string;
  brandColor: string | null;
  accountName: string;
  handle: string;
  payLink: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface BrandingRow {
  brandName: string;
  logoPath: string | null;
  logoUrl: string | null;
  signinHeading: string;
  signinSubtext: string;
}

export interface SheetLogRow {
  accountId: string;
  username: string;
  playerName: string;
  playerEmail: string | null;
  gameName: string;
  status: "creating" | "active";
  createdAt: string;
}

export interface AgentRow {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  permissions: StaffPermissions;
}

/* ── Audit + auth guards ───────────────────────────────────────────────── */

function audit(adminId: string, action: string, detail?: string): void {
  console.info(
    JSON.stringify({
      scope: "admin",
      adminId,
      action,
      detail: detail ?? null,
      at: new Date().toISOString(),
    }),
  );
}

function svc() {
  return createServiceClient();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Best-effort "agent is typing…" on the player's chat while the next message
 * is prepared (Build 56 — human pacing). Decoration only; failures ignored.
 */
async function broadcastAgentTyping(playerId: string): Promise<void> {
  try {
    await svc()
      .channel(`typing:${playerId}`)
      .send({ type: "broadcast", event: "typing", payload: { from: "admin" } });
  } catch {
    /* typing is decoration — never break the flow */
  }
}

async function requireAdmin(adminId: string): Promise<AdminInfo> {
  const { data, error } = await svc()
    .from("admin_users")
    .select("id, role, display_name, email, is_active, permissions")
    .eq("id", adminId)
    .single();
  if (error || !data || data.is_active !== true) {
    throw new Error("Not authorized");
  }
  const role = data.role as AdminRole;
  return {
    id: data.id as string,
    role,
    displayName: (data.display_name as string) || (data.email as string),
    email: data.email as string,
    permissions: parsePermissions(data.permissions, role),
  };
}

/** Guard for a single grantable permission (super admin always passes). */
async function requirePermission(
  adminId: string,
  key: StaffPermissionKey,
): Promise<AdminInfo> {
  const me = await requireAdmin(adminId);
  if (!me.permissions[key]) {
    throw new Error("Not authorized — this permission is not granted to your account");
  }
  return me;
}

async function requireSuperAdmin(adminId: string): Promise<AdminInfo> {
  const me = await requireAdmin(adminId);
  if (me.role !== "super_admin") throw new Error("Not authorized");
  return me;
}

/**
 * Scoped revalidation for the server-rendered section pages only.
 * Inbox actions must NOT revalidate: the inbox is client-state driven and
 * refetches itself (onMutated) — a layout revalidation here re-rendered the
 * whole inbox inside every click's POST response (the #1 speed killer).
 */
function revalidateSection(path: string): void {
  revalidatePath(path);
}

/* ── Auth ──────────────────────────────────────────────────────────────── */

const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

/** Admin sign-in. Signs the user in, verifies admin_users, signs out if not an admin. */
export async function adminSignIn(
  input: z.input<typeof signInSchema>,
): Promise<{ ok: true }> {
  const { email, password } = signInSchema.parse(input);
  const supabase = await createClient();

  // Specific "no account" error WITHOUT downloading the whole auth user
  // list (listUsers was a full-table Auth Admin call on every attempt):
  // one indexed admin_users lookup by email does the same job.
  const { data: emailRow } = await svc()
    .from("admin_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!emailRow) throw new Error("No account found with this email");

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error("Incorrect password — please try again");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in failed — please try again");

  const { data: adminRow } = await svc()
    .from("admin_users")
    .select("id, is_active")
    .eq("id", user.id)
    .single();

  if (!adminRow || adminRow.is_active !== true) {
    await supabase.auth.signOut();
    throw new Error("This account is not authorized for admin access");
  }
  audit(user.id, "admin.sign_in");
  return { ok: true };
}

/** Admin sign-out (clears the session cookie). */
export async function adminSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/**
 * Session check for server components (layout + login page).
 * Returns the admin info, or null when there is no session / not an admin.
 */
export const getAdminSession = cache(
  async (): Promise<AdminInfo | null> => {
    const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await svc()
    .from("admin_users")
    .select("id, role, display_name, email, is_active, permissions")
    .eq("id", user.id)
    .single();
    if (!data || data.is_active !== true) return null;
    const role = data.role as AdminRole;
    return {
      id: data.id as string,
      role,
      displayName: (data.display_name as string) || (data.email as string),
      email: data.email as string,
      permissions: parsePermissions(data.permissions, role),
    };
  },
);

/* ── Notifications ─────────────────────────────────────────────────────── */

const NOTIF_LIMIT = 30;

export async function getNotifications(): Promise<NotificationView[]> {
  const { data: rows } = await svc()
    .from("notifications")
    .select("id, kind, player_id, preview, created_at")
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(NOTIF_LIMIT);

  const list = (rows ?? []) as Array<{
    id: string;
    kind: string;
    player_id: string;
    preview: string | null;
    created_at: string;
  }>;
  if (list.length === 0) return [];

  const playerIds = [...new Set(list.map((n) => n.player_id))];
  const { data: players } = await svc()
    .from("players")
    .select("id, display_name")
    .in("id", playerIds);
  const names = new Map(
    ((players ?? []) as Array<{ id: string; display_name: string }>).map(
      (p) => [p.id, p.display_name] as const,
    ),
  );

  return list.map((n) => ({
    id: n.id,
    kind: n.kind as NotificationView["kind"],
    playerId: n.player_id,
    playerName: names.get(n.player_id) ?? "Player",
    preview: n.preview,
    createdAt: n.created_at,
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count } = await svc()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  return count ?? 0;
}

export async function markNotificationRead(
  adminId: string,
  notificationId: string,
): Promise<void> {
  await requireAdmin(adminId);
  await svc().from("notifications").update({ is_read: true }).eq("id", notificationId);
  audit(adminId, "notifications.mark_read", notificationId);
}

/* ── Inbox: players overview ───────────────────────────────────────────── */

interface DbPlayer {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  is_online: boolean;
  created_at: string;
}

function messagePreview(kind: string, body: Record<string, unknown>): string {
  const text = typeof body.text === "string" ? body.text : "";
  switch (kind) {
    case "text":
    case "system":
      return text.slice(0, 90) || "—";
    case "account":
      return `Game account · ${text || "credentials"}`.slice(0, 90);
    case "games_list":
      return typeof body.title === "string" ? body.title.slice(0, 90) : "Game list";
    case "pay_list":
      return typeof body.title === "string"
        ? body.title.slice(0, 90)
        : "Payment methods";
    case "payment_card":
      return "Payment details";
    case "shot":
      return typeof body.caption === "string" && body.caption
        ? body.caption.slice(0, 90)
        : "Screenshot";
    default:
      return "—";
  }
}

/** Full player list for the inbox, with tags, unread counts, last message and action flags. */
export async function getInboxOverview(): Promise<PlayerOverview[]> {
  const client = svc();

  const { data: players } = await client
    .from("players")
    .select("id, display_name, email, avatar_url, is_online, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const playerList = (players ?? []) as DbPlayer[];
  if (playerList.length === 0) return [];

  const ids = playerList.map((p) => p.id);

  // All independent queries in parallel (was 5 sequential round-trips).
  const [tagsRes, unreadRes, pendingRes, creatingRes, recentRes] =
    await Promise.all([
      client.from("player_tags").select("player_id, tag").in("player_id", ids),
      client
        .from("chat_messages")
        .select("player_id")
        .in("player_id", ids)
        .eq("sender", "player")
        .eq("is_read_by_admin", false),
      client
        .from("deposits")
        .select("player_id")
        .in("player_id", ids)
        .eq("status", "pending"),
      client
        .from("game_accounts")
        .select("player_id")
        .in("player_id", ids)
        .eq("status", "creating"),
      client
        .from("chat_messages")
        .select("player_id, kind, body, created_at")
        .in("player_id", ids)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const { data: tags } = tagsRes;
  const { data: unread } = unreadRes;
  const { data: pendingDeposits } = pendingRes;
  const { data: creating } = creatingRes;
  const { data: recent } = recentRes;
  const tagMap = new Map<string, string[]>();
  for (const t of ((tags ?? []) as Array<{ player_id: string; tag: string }>)) {
    const arr = tagMap.get(t.player_id) ?? [];
    arr.push(t.tag);
    tagMap.set(t.player_id, arr);
  }

  const unreadMap = new Map<string, number>();
  for (const m of ((unread ?? []) as Array<{ player_id: string }>)) {
    unreadMap.set(m.player_id, (unreadMap.get(m.player_id) ?? 0) + 1);
  }

  const pendingMap = new Map<string, number>();
  for (const d of ((pendingDeposits ?? []) as Array<{ player_id: string }>)) {
    pendingMap.set(d.player_id, (pendingMap.get(d.player_id) ?? 0) + 1);
  }

  const creatingMap = new Map<string, number>();
  for (const a of ((creating ?? []) as Array<{ player_id: string }>)) {
    creatingMap.set(a.player_id, (creatingMap.get(a.player_id) ?? 0) + 1);
  }

  // Latest message per player (recent window, then take first per player).
  const lastMap = new Map<
    string,
    { kind: string; body: Record<string, unknown>; created_at: string }
  >();
  for (const m of ((recent ?? []) as Array<{
    player_id: string;
    kind: string;
    body: Record<string, unknown>;
    created_at: string;
  }>)) {
    if (!lastMap.has(m.player_id)) lastMap.set(m.player_id, m);
  }

  const overview: PlayerOverview[] = playerList.map((p) => {
    const last = lastMap.get(p.id) ?? null;
    return {
      id: p.id,
      displayName: p.display_name,
      email: p.email,
      avatarUrl: p.avatar_url,
      isOnline: p.is_online,
      createdAt: p.created_at,
      tags: (tagMap.get(p.id) ?? []).sort(),
      unreadCount: unreadMap.get(p.id) ?? 0,
      pendingDeposits: pendingMap.get(p.id) ?? 0,
      creatingAccounts: creatingMap.get(p.id) ?? 0,
      lastMessageAt: last ? last.created_at : null,
      lastPreview: last ? messagePreview(last.kind, last.body) : null,
    };
  });

  // Most recent activity first; never-messaged players at the bottom.
  overview.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0;
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
  return overview;
}

/* ── Inbox: thread ─────────────────────────────────────────────────────── */

function publicUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

async function signedScreenshotUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await svc()
    .storage.from("screenshots")
    .createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Full chat thread for one player, with card/list payloads resolved server-side. */
export async function getThread(playerId: string): Promise<ChatMessageView[]> {
  const client = svc();

  // Messages + games + methods in parallel (were sequential).
  const [messagesRes, gamesRes, methodsRes] = await Promise.all([
    client
      .from("chat_messages")
      .select("id, player_id, sender, kind, body, created_at, is_read_by_player, is_read_by_admin")
      .eq("player_id", playerId)
      // LATEST 500, not the OLDEST 200 (Build 42) — same truncation trap
      // as the player side; rows are reversed back to ascending below.
      .order("created_at", { ascending: false })
      .limit(500),
    client.from("games").select("id, name"),
    client.from("payment_methods").select("id, name"),
  ]);

  const { data: messagesDesc } = messagesRes;
  const messages = (messagesDesc ?? []).slice().reverse();
  const { data: games } = gamesRes;
  const { data: methods } = methodsRes;
  const gameNames = new Map(
    ((games ?? []) as Array<{ id: string; name: string }>).map(
      (g) => [g.id, g.name] as const,
    ),
  );
  const methodNames = new Map(
    ((methods ?? []) as Array<{ id: string; name: string }>).map(
      (m) => [m.id, m.name] as const,
    ),
  );

  // Resolve account cards (username + current status) in one query.
  const rows = ((messages ?? []) as Array<{
    id: string;
    player_id: string;
    sender: string;
    kind: string;
    body: Record<string, unknown>;
    created_at: string;
    is_read_by_player: boolean;
    is_read_by_admin: boolean;
  }>);
  const accountIds = rows
    .filter((m) => m.kind === "account")
    .map((m) => m.body.account_id)
    .filter((v): v is string => typeof v === "string");
  const accountMap = new Map<
    string,
    { game_id: string; username: string; status: string }
  >();
  if (accountIds.length > 0) {
    const { data: accounts } = await client
      .from("game_accounts")
      .select("id, game_id, username, status")
      .in("id", [...new Set(accountIds)]);
    for (const a of ((accounts ?? []) as Array<{
      id: string;
      game_id: string;
      username: string;
      status: string;
    }>)) {
      accountMap.set(a.id, a);
    }
  }

  const views: ChatMessageView[] = [];
  const shotPaths: Array<{ index: number; path: string }> = [];
  for (const m of rows) {
    const body = m.body ?? {};
    let account: ThreadAccountCard | null = null;
    if (m.kind === "account" && typeof body.account_id === "string") {
      const acc = accountMap.get(body.account_id);
      if (acc) {
        account = {
          gameId: acc.game_id,
          accountId: body.account_id,
          status: (typeof body.status === "string" ? body.status : acc.status) as
            | "creating"
            | "active",
          gameName: gameNames.get(acc.game_id) ?? acc.game_id,
          username: acc.username,
        };
      }
    }

    const pickedRaw = body.picked as { id?: string; at?: string } | null;
    const picked: ThreadPick | null =
      pickedRaw && typeof pickedRaw.id === "string"
        ? { id: pickedRaw.id, at: typeof pickedRaw.at === "string" ? pickedRaw.at : "" }
        : null;
    let pickedName: string | null = null;
    if (picked) {
      pickedName =
        m.kind === "games_list"
          ? (gameNames.get(picked.id) ?? picked.id)
          : m.kind === "pay_list"
            ? (methodNames.get(picked.id) ?? picked.id)
            : picked.id;
    }

    const snapshot = body.snapshot as
      | {
          name?: string;
          account_name?: string;
          brand_color?: string;
          handle?: string;
          note?: string;
          pay_link?: string;
        }
      | undefined;

    const screenshotPath =
      m.kind === "shot" && typeof body.screenshot_path === "string"
        ? body.screenshot_path
        : null;
    const index = views.length;
    if (screenshotPath) shotPaths.push({ index, path: screenshotPath });

    views.push({
      id: m.id,
      playerId: m.player_id,
      sender: m.sender as ChatSender,
      kind: m.kind as ChatKind,
      createdAt: m.created_at,
      text: typeof body.text === "string" ? body.text : null,
      account,
      listTitle: typeof body.title === "string" ? body.title : null,
      picked,
      pickedName,
      paymentCard:
        m.kind === "payment_card" && snapshot
          ? {
              name: snapshot.name ?? "",
              accountName: snapshot.account_name ?? null,
              brandColor: snapshot.brand_color ?? null,
              handle: snapshot.handle ?? "",
              note: snapshot.note ?? null,
              payLink: snapshot.pay_link ?? null,
            }
          : null,
      screenshotUrl: null,
      readByPlayer: m.is_read_by_player,
      readByAdmin: m.is_read_by_admin,
      screenshotCaption:
        m.kind === "shot" && typeof body.caption === "string"
          ? body.caption
          : null,
    });
  }
  // Mint ALL screenshot URLs in ONE Storage batch call (was one HTTP
  // round trip per screenshot, on every thread fetch).
  if (shotPaths.length > 0) {
    const { data: signed } = await svc()
      .storage.from("screenshots")
      .createSignedUrls(
        shotPaths.map((s) => s.path),
        3600,
      );
    const byPath = new Map(
      (signed ?? [])
        .filter((s) => s.path && s.signedUrl)
        .map((s) => [s.path as string, s.signedUrl as string]),
    );
    for (const { index, path } of shotPaths) {
      views[index].screenshotUrl = byPath.get(path) ?? null;
    }
  }
  return views;
}

/** Mark the whole thread as read by admin when the agent opens it. */
export async function markThreadRead(
  adminId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin(adminId);
  await svc()
    .from("chat_messages")
    .update({ is_read_by_admin: true })
    .eq("player_id", playerId)
    .eq("sender", "player")
    .eq("is_read_by_admin", false);
}

/* ── Inbox: sending ────────────────────────────────────────────────────── */

const textSchema = z.object({
  playerId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});

async function insertAdminText(
  adminId: string,
  playerId: string,
  text: string,
): Promise<void> {
  const { error } = await svc().from("chat_messages").insert({
    player_id: playerId,
    sender: "admin",
    kind: "text",
    body: { text },
    is_read_by_player: false,
    is_read_by_admin: true,
  });
  if (error) throw new Error("Could not send message");
}

/** Admin sends a free-text message in the thread. */
export async function sendAdminMessage(
  adminId: string,
  input: z.input<typeof textSchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const { playerId, text } = textSchema.parse(input);
  await insertAdminText(adminId, playerId, text);
  audit(adminId, "chat.send_message", playerId);
}

const quickReplySchema = z.object({
  playerId: z.string().uuid(),
  key: z.string().min(1),
});

/** Send a preset quick reply (short label → full message). */
export async function sendQuickReply(
  adminId: string,
  input: z.input<typeof quickReplySchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const { playerId, key } = quickReplySchema.parse(input);
  const preset = QUICK_REPLIES[key];
  if (!preset) throw new Error("Unknown quick reply");
  await insertAdminText(adminId, playerId, preset.message);
  audit(adminId, "chat.quick_reply", `${playerId}:${key}`);
}

/** SEND bar: push the full active games list to the player's chat. The items
 *  MUST be embedded in the body — the player picker renders from the body,
 *  and a list without items shows as an empty card (Build 38 fix). */
export async function sendGamesList(
  adminId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(playerId);
  const { data: games } = await svc()
    .from("games")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const { error } = await svc().from("chat_messages").insert({
    player_id: playerId,
    sender: "admin",
    kind: "games_list",
    body: {
      title: "Choose your game",
      games: (games ?? []).map((g) => ({
        id: g.id as string,
        name: g.name as string,
      })),
      picked: null,
    },
    is_read_by_player: false,
    is_read_by_admin: true,
  });
  if (error) throw new Error("Could not send game list");
  audit(adminId, "chat.send_games_list", playerId);
}

/** SEND bar: push the full active payment-methods list to the player's chat.
 *  Items embedded in the body — same empty-picker fix as sendGamesList. */
export async function sendPayList(
  adminId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(playerId);
  const { data: methods } = await svc()
    .from("payment_methods")
    .select("id, name, handle, brand_color")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const { error } = await svc().from("chat_messages").insert({
    player_id: playerId,
    sender: "admin",
    kind: "pay_list",
    body: {
      title: "Choose a payment method",
      methods: (methods ?? []).map((m) => ({
        id: m.id as string,
        name: m.name as string,
        handle: m.handle as string,
        brand_color: (m.brand_color as string | null) ?? null,
      })),
      picked: null,
    },
    is_read_by_player: false,
    is_read_by_admin: true,
  });
  if (error) throw new Error("Could not send payment list");
  audit(adminId, "chat.send_pay_list", playerId);
}

/** SEND bar: push ONE payment method's detail card straight to the chat —
 *  same payment_card shape a player pick produces (Build 38). */
export async function sendSingleMethod(
  adminId: string,
  playerId: string,
  methodId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(playerId);
  z.string().min(1).parse(methodId); // payment_methods.id is TEXT (slug), not uuid — uuid parse here killed every single-method send (Build 41)
  const { data: method } = await svc()
    .from("payment_methods")
    .select("id, name, account_name, brand_color, handle, note, pay_link")
    .eq("id", methodId)
    .single();
  if (!method) throw new Error("Payment method not found");
  const m = method as {
    id: string;
    name: string;
    account_name: string;
    brand_color: string | null;
    handle: string;
    note: string | null;
    pay_link: string | null;
  };
  const { error } = await svc().from("chat_messages").insert({
    player_id: playerId,
    sender: "admin",
    kind: "payment_card",
    body: {
      payment_method_id: m.id,
      snapshot: {
        name: m.name,
        account_name: m.account_name,
        brand_color: m.brand_color,
        handle: m.handle,
        note: m.note,
        pay_link: m.pay_link,
      },
    },
    is_read_by_player: false,
    is_read_by_admin: true,
  });
  if (error) throw new Error("Could not send payment method");
  audit(adminId, "chat.send_single_method", `${playerId}/${methodId}`);
}

/* ── Inbox: player detail (tags, notes, accounts, deposits) ─────────────── */

export async function getPlayerDetail(
  playerId: string,
): Promise<PlayerDetailView | null> {
  const client = svc();
  const { data: player } = await client
    .from("players")
    .select("id, display_name, email, avatar_url, is_online, is_blocked, blocked_at")
    .eq("id", playerId)
    .single();
  if (!player) return null;

  const [{ data: tags }, { data: notes }, { data: accounts }, { data: deposits }] =
    await Promise.all([
      client.from("player_tags").select("tag").eq("player_id", playerId),
      client
        .from("player_notes")
        .select("id, body, created_by, created_at")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false }),
      client
        .from("game_accounts")
        .select("id, game_id, username, status, created_at, activated_at")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false }),
      client
        .from("deposits")
        .select("id, amount, payment_method_id, screenshot_path, created_at")
        .eq("player_id", playerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const accountList = (accounts ?? []) as Array<{
    id: string;
    game_id: string;
    username: string;
    status: string;
    created_at: string;
    activated_at: string | null;
  }>;
  const depositList = (deposits ?? []) as Array<{
    id: string;
    amount: string;
    payment_method_id: string;
    screenshot_path: string | null;
    created_at: string;
  }>;
  const gameIds = [...new Set(accountList.map((a) => a.game_id))];
  const methodIds = [...new Set(depositList.map((d) => d.payment_method_id))];
  const creatorIds = [
    ...new Set(
      ((notes ?? []) as Array<{ created_by: string | null }>)
        .map((n) => n.created_by)
        .filter((v): v is string => !!v),
    ),
  ];

  // Name lookups in parallel (were 3 sequential round-trips).
  const [gamesRes, methodsRes, creatorsRes] = await Promise.all([
    gameIds.length > 0
      ? client.from("games").select("id, name").in("id", gameIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    methodIds.length > 0
      ? client.from("payment_methods").select("id, name").in("id", methodIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    creatorIds.length > 0
      ? client.from("admin_users").select("id, display_name, email").in("id", creatorIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; display_name: string | null; email: string }>,
        }),
  ]);
  const gameNames = new Map<string, string>();
  for (const g of ((gamesRes.data ?? []) as Array<{ id: string; name: string }>)) {
    gameNames.set(g.id, g.name);
  }
  const methodNames = new Map<string, string>();
  for (const m of ((methodsRes.data ?? []) as Array<{ id: string; name: string }>)) {
    methodNames.set(m.id, m.name);
  }
  const creatorNames = new Map<string, string>();
  for (const c of ((creatorsRes.data ?? []) as Array<{
    id: string;
    display_name: string | null;
    email: string;
  }>)) {
    creatorNames.set(c.id, c.display_name || c.email);
  }

  return {
    player: {
      id: player.id as string,
      displayName: player.display_name as string,
      email: (player.email as string | null) ?? null,
      avatarUrl: (player.avatar_url as string | null) ?? null,
      isOnline: (player.is_online as boolean) ?? false,
      isBlocked: (player.is_blocked as boolean) ?? false,
      blockedAt: (player.blocked_at as string | null) ?? null,
    },
    tags: ((tags ?? []) as Array<{ tag: string }>)
      .map((t) => t.tag)
      .sort(),
    notes: ((notes ?? []) as Array<{
      id: string;
      body: string;
      created_by: string | null;
      created_at: string;
    }>).map((n) => ({
      id: n.id,
      body: n.body,
      createdBy: n.created_by ? (creatorNames.get(n.created_by) ?? "Agent") : "Agent",
      createdAt: n.created_at,
    })),
    accounts: accountList.map((a) => ({
      id: a.id,
      gameId: a.game_id,
      gameName: gameNames.get(a.game_id) ?? a.game_id,
      username: a.username,
      status: a.status as "creating" | "active",
      createdAt: a.created_at,
      activatedAt: a.activated_at,
    })),
    pendingDeposits: await Promise.all(
      depositList.map(async (d) => ({
        id: d.id,
        amount: d.amount,
        methodName: methodNames.get(d.payment_method_id) ?? d.payment_method_id,
        screenshotUrl: await signedScreenshotUrl(d.screenshot_path),
        createdAt: d.created_at,
      })),
    ),
  };
}

/* ── Inbox: tags + notes ───────────────────────────────────────────────── */

const tagSchema = z.object({
  playerId: z.string().uuid(),
  tag: z.string().trim().min(1).max(40),
});

export async function addPlayerTag(
  adminId: string,
  input: z.input<typeof tagSchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const { playerId, tag } = tagSchema.parse(input);
  const normalized = normalizeTag(tag);
  const { error } = await svc()
    .from("player_tags")
    .upsert({ player_id: playerId, tag: normalized }, { onConflict: "player_id,tag" });
  if (error) throw new Error("Could not add tag");
  audit(adminId, "tags.add", `${playerId}:${normalized}`);
}

export async function removePlayerTag(
  adminId: string,
  input: z.input<typeof tagSchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const { playerId, tag } = tagSchema.parse(input);
  const normalized = normalizeTag(tag);
  const { error } = await svc()
    .from("player_tags")
    .delete()
    .eq("player_id", playerId)
    .eq("tag", normalized);
  if (error) throw new Error("Could not remove tag");
  audit(adminId, "tags.remove", `${playerId}:${normalized}`);
}

const noteSchema = z.object({
  playerId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function addPlayerNote(
  adminId: string,
  input: z.input<typeof noteSchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const { playerId, body } = noteSchema.parse(input);
  const { error } = await svc().from("player_notes").insert({
    player_id: playerId,
    body,
    created_by: adminId,
  });
  if (error) throw new Error("Could not add note");
  audit(adminId, "notes.add", playerId);
}

export async function deletePlayerNote(
  adminId: string,
  noteId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(noteId);
  const { error } = await svc().from("player_notes").delete().eq("id", noteId);
  if (error) throw new Error("Could not delete note");
  audit(adminId, "notes.delete", noteId);
}

/* ── Inbox: game accounts (edit / delete / mark active) ─────────────────── */

const editAccountSchema = z.object({
  accountId: z.string().uuid(),
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(128).optional(),
});

export async function editGameAccount(
  adminId: string,
  input: z.input<typeof editAccountSchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const { accountId, username, password } = editAccountSchema.parse(input);
  const client = svc();
  const { data: existing } = await client
    .from("game_accounts")
    .select("id, player_id")
    .eq("id", accountId)
    .single();
  if (!existing) throw new Error("Account not found");

  const patch: Record<string, string> = { username };
  if (password) patch.password_enc = encryptPassword(password);
  const { error } = await client
    .from("game_accounts")
    .update(patch)
    .eq("id", accountId);
  if (error) throw new Error("Could not update account");
  audit(adminId, "accounts.edit", `${accountId} player=${existing.player_id}`);
}

export async function deleteGameAccount(
  adminId: string,
  accountId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(accountId);
  const client = svc();
  const { data: existing } = await client
    .from("game_accounts")
    .select("id, player_id")
    .eq("id", accountId)
    .single();
  if (!existing) throw new Error("Account not found");
  const { error } = await client.from("game_accounts").delete().eq("id", accountId);
  if (error) throw new Error("Could not delete account");
  audit(adminId, "accounts.delete", `${accountId} player=${existing.player_id}`);
}

/**
 * Mark an account as active (dual update): flip the game_accounts row,
 * flip the in-chat account card in place, and notify the player.
 */
/**
 * Send an image into a player's chat (Build 58 — attach button / paste).
 * Stored in the same screenshots bucket as deposit shots; renders as a
 * normal photo message on both sides.
 */
export async function adminSendChatImage(
  adminId: string,
  playerId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(playerId);
  const entry = formData.get("screenshot");
  if (!(entry instanceof File) || entry.size === 0) {
    throw new Error("No image attached");
  }
  if (!entry.type.startsWith("image/")) throw new Error("That file isn't an image");
  if (entry.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");
  const client = svc();
  const ext = entry.type.includes("png") ? "png" : "jpg";
  const path = `${playerId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await entry.arrayBuffer());
  const { error: upError } = await client.storage
    .from("screenshots")
    .upload(path, buffer, {
      contentType: entry.type || "image/jpeg",
      upsert: false,
    });
  if (upError) throw new Error("Couldn't upload the image. Try again.");
  const { error } = await client.from("chat_messages").insert({
    player_id: playerId,
    sender: "admin",
    kind: "shot",
    body: { screenshot_path: path, caption: "Image from support" },
    is_read_by_player: false,
    is_read_by_admin: true,
  });
  if (error) throw new Error("Couldn't send the image. Try again.");
}

export async function markAccountActive(
  adminId: string,
  accountId: string,
): Promise<void> {
  const me = await requireAdmin(adminId);
  z.string().uuid().parse(accountId);
  const client = svc();

  const { data: account } = await client
    .from("game_accounts")
    .select("id, player_id, game_id, status")
    .eq("id", accountId)
    .single();
  if (!account) throw new Error("Account not found");
  if (account.status === "active") return;

  // Status flip + card lookup + game name are independent — ONE parallel
  // batch (this action used to be 8 strictly sequential round trips).
  const [updateRes, cardMsgRes, gameRes] = await Promise.all([
    client
      .from("game_accounts")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", accountId),
    client
      .from("chat_messages")
      .select("id, body")
      .eq("player_id", account.player_id as string)
      .eq("kind", "account")
      .order("created_at", { ascending: false })
      .limit(10),
    client
      .from("games")
      .select("name")
      .eq("id", account.game_id as string)
      .maybeSingle(),
  ]);
  if (updateRes.error) throw new Error("Could not activate account");

  // Flip the existing in-chat card (R2: one account = one card).
  const target = ((cardMsgRes.data ?? []) as Array<{
    id: string;
    body: Record<string, unknown>;
  }>).find((m) => m.body.account_id === accountId);

  // Notify the player with a warm, human-style chat message naming the game
  // (kind "text" so it renders as a normal agent bubble, not a robotic
  // centered system pill). Flip the card + clear the notification first…
  const gameName = (gameRes.data?.name as string | undefined) ?? "your game";
  await Promise.all([
    target
      ? client
          .from("chat_messages")
          .update({
            body: {
              ...(target.body as Record<string, unknown>),
              status: "active",
            },
          })
          .eq("id", target.id)
      : Promise.resolve(),
    client
      .from("notifications")
      .update({ is_read: true })
      .eq("player_id", account.player_id as string)
      .eq("kind", "account_request")
      .eq("ref_id", accountId),
  ]);

  // …then a human beat (Build 56): the agent "types" for ~1s and the ready
  // message lands after the card flip — like a person, not a robot dumping
  // everything in the same instant.
  void broadcastAgentTyping(account.player_id as string);
  await sleep(1000);
  await client.from("chat_messages").insert({
    player_id: account.player_id,
    sender: "system",
    kind: "text",
    body: {
      text: `Great news — your ${gameName} account is ready to go! 🎉 Your username and password are in the card above. Have fun, and good luck! 🍀`,
    },
    is_read_by_player: false,
    is_read_by_admin: true,
  });

  audit(adminId, `accounts.mark_active by=${me.displayName}`, accountId);
}

/**
 * Reveal a game account password (explicit show/copy action — R7).
 * The plaintext is decrypted server-side and returned only to the admin.
 */
export async function decryptAccountPassword(
  adminId: string,
  accountId: string,
): Promise<string> {
  await requireAdmin(adminId);
  z.string().uuid().parse(accountId);
  const { data } = await svc()
    .from("game_accounts")
    .select("password_enc")
    .eq("id", accountId)
    .single();
  if (!data) throw new Error("Account not found");
  audit(adminId, "accounts.reveal_password", accountId);
  return decryptPassword(data.password_enc as string);
}

/* ── Inbox: deposit verification ───────────────────────────────────────── */

const rejectSchema = z.object({
  depositId: z.string().uuid(),
  note: z.string().trim().max(500).default(""),
});

export async function approveDeposit(
  adminId: string,
  depositId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(depositId);
  const client = svc();

  const { data: deposit } = await client
    .from("deposits")
    .select("id, player_id, amount, status, payment_method_id")
    .eq("id", depositId)
    .single();
  if (!deposit) throw new Error("Deposit not found");
  if (deposit.status !== "pending") throw new Error("Deposit already decided");

  const { error } = await client
    .from("deposits")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    })
    .eq("id", depositId);
  if (error) throw new Error("Could not approve deposit");

  // Independent writes — one parallel batch instead of two round trips.
  await Promise.all([
    client.from("chat_messages").insert({
      player_id: deposit.player_id,
      sender: "admin",
      kind: "text",
      body: {
        text: `Great news — your deposit of $${deposit.amount} is approved! 🎉 Give me a moment, I'm adding the credits to your account with the bonus right now 🍀`,
      },
      is_read_by_player: false,
      is_read_by_admin: true,
    }),
    client
      .from("notifications")
      .update({ is_read: true })
      .eq("kind", "deposit")
      .eq("ref_id", depositId),
  ]);

  audit(adminId, "deposits.approve", `${depositId} amount=${deposit.amount}`);
}

export async function rejectDeposit(
  adminId: string,
  input: z.input<typeof rejectSchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const { depositId, note } = rejectSchema.parse(input);
  const client = svc();

  const { data: deposit } = await client
    .from("deposits")
    .select("id, player_id, amount, status")
    .eq("id", depositId)
    .single();
  if (!deposit) throw new Error("Deposit not found");
  if (deposit.status !== "pending") throw new Error("Deposit already decided");

  const { error } = await client
    .from("deposits")
    .update({
      status: "rejected",
      admin_note: note || null,
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    })
    .eq("id", depositId);
  if (error) throw new Error("Could not reject deposit");

  await Promise.all([
    client.from("chat_messages").insert({
      player_id: deposit.player_id,
      sender: "admin",
      kind: "text",
      body: {
        text: note
          ? `Deposit rejected: ${note}`
          : "Deposit rejected. Please contact support for details.",
      },
      is_read_by_player: false,
      is_read_by_admin: true,
    }),
    client
      .from("notifications")
      .update({ is_read: true })
      .eq("kind", "deposit")
      .eq("ref_id", depositId),
  ]);

  audit(adminId, "deposits.reject", depositId);
}

/** Mint a 1-hour signed URL for a private deposit screenshot. */
export async function mintScreenshotUrl(
  adminId: string,
  path: string,
): Promise<string> {
  await requireAdmin(adminId);
  z.string().min(1).max(500).parse(path);
  const url = await signedScreenshotUrl(path);
  if (!url) throw new Error("Could not load screenshot");
  audit(adminId, "screenshots.mint_url", path);
  return url;
}

/* ── Games Library ─────────────────────────────────────────────────────── */

function toGameRow(g: Record<string, unknown>): GameRow {
  const iconPath = (g.icon_path as string | null) ?? null;
  return {
    id: g.id as string,
    name: g.name as string,
    category: (g.category as string | null) ?? null,
    iconPath,
    iconUrl: iconPath ? publicUrl("game-icons", iconPath) : null,
    link: (g.link as string | null) ?? null,
    webLink: (g.web_link as string | null) ?? null,
    access: (g.access as GameRow["access"]) ?? "both",
    firstBonusPct: Number(g.first_bonus_pct ?? 0),
    regBonusPct: Number(g.reg_bonus_pct ?? 0),
    minLoad: g.min_load != null ? String(g.min_load) : null,
    maxLoad: g.max_load != null ? String(g.max_load) : null,
    redeemInfo: (g.redeem_info as string | null) ?? null,
    sortOrder: Number(g.sort_order ?? 0),
    isActive: (g.is_active as boolean) ?? true,
  };
}

export async function getGames(): Promise<GameRow[]> {
  const { data } = await svc()
    .from("games")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map(toGameRow);
}

const gameSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase letters, digits and hyphens"),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(60).optional().default(""),
  link: z.string().trim().max(500).optional().default(""),
  webLink: z.string().trim().max(500).optional().default(""),
  access: z.enum(["both", "app", "web"]).default("both"),
  firstBonusPct: z.coerce.number().int().min(0).max(1000).default(0),
  regBonusPct: z.coerce.number().int().min(0).max(1000).default(0),
  minLoad: z.coerce.number().min(0).max(100000).optional(),
  maxLoad: z.coerce.number().min(0).max(100000).optional(),
  redeemInfo: z.string().trim().max(120).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

/** Concrete form payload for upsertGame (zod coerce makes z.input too loose for JSX). */
export interface GameFormData {
  id: string;
  name: string;
  category?: string;
  link?: string;
  webLink?: string;
  access?: "both" | "app" | "web";
  firstBonusPct?: number;
  regBonusPct?: number;
  minLoad?: number;
  maxLoad?: number;
  redeemInfo?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function upsertGame(
  adminId: string,
  input: GameFormData,
): Promise<void> {
  await requireAdmin(adminId);
  const g = gameSchema.parse(input);
  const row = {
    id: g.id,
    name: g.name,
    category: g.category || null,
    link: g.link || null,
    web_link: g.webLink || null,
    access: g.access,
    first_bonus_pct: g.firstBonusPct,
    reg_bonus_pct: g.regBonusPct,
    min_load: g.minLoad ?? null,
    max_load: g.maxLoad ?? null,
    redeem_info: g.redeemInfo || null,
    sort_order: g.sortOrder,
    is_active: g.isActive,
  };
  const { error } = await svc().from("games").upsert(row, { onConflict: "id" });
  if (error) throw new Error("Could not save game");
  audit(adminId, "games.upsert", g.id);
  revalidateSection("/admin/games");
}

/** Delete a game — blocked when players hold accounts for it. */
export async function deleteGame(adminId: string, gameId: string): Promise<void> {
  await requireAdmin(adminId);
  z.string().min(1).parse(gameId);
  const client = svc();
  const { count } = await client
    .from("game_accounts")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if ((count ?? 0) > 0) {
    throw new Error(
      `Cannot delete: ${count} player account${count === 1 ? "" : "s"} exist for this game.`,
    );
  }
  const { error } = await client.from("games").delete().eq("id", gameId);
  if (error) throw new Error("Could not delete game");
  audit(adminId, "games.delete", gameId);
  revalidateSection("/admin/games");
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Upload a game icon to the public game-icons bucket. Returns the stored path. */
export async function uploadGameIcon(
  adminId: string,
  formData: FormData,
): Promise<{ path: string; url: string }> {
  await requireAdmin(adminId);
  const gameId = String(formData.get("gameId") ?? "");
  const file = formData.get("file");
  z.string().min(1).parse(gameId);
  if (!(file instanceof File)) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image must be 8 MB or smaller");

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${gameId}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await svc()
    .storage.from("game-icons")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) throw new Error("Could not upload icon");

  await svc().from("games").update({ icon_path: path }).eq("id", gameId);
  audit(adminId, "games.upload_icon", gameId);
  revalidateSection("/admin/games");
  return { path, url: publicUrl("game-icons", path) };
}

/* ── Payment Methods ───────────────────────────────────────────────────── */

export async function getPaymentMethods(): Promise<PaymentMethodRow[]> {
  const { data } = await svc()
    .from("payment_methods")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    brandColor: (m.brand_color as string | null) ?? null,
    accountName: m.account_name as string,
    handle: m.handle as string,
    payLink: (m.pay_link as string | null) ?? null,
    note: (m.note as string | null) ?? null,
    sortOrder: Number(m.sort_order ?? 0),
    isActive: (m.is_active as boolean) ?? true,
  }));
}

const methodSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase letters, digits and hyphens"),
  name: z.string().trim().min(1).max(80),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #D4AF37")
    .optional()
    .default(""),
  accountName: z.string().trim().min(1).max(120),
  handle: z.string().trim().min(1).max(120),
  payLink: z.string().trim().max(500).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

/** Concrete form payload for upsertPaymentMethod. */
export interface MethodFormData {
  id: string;
  name: string;
  brandColor?: string;
  accountName: string;
  handle: string;
  payLink?: string;
  note?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function upsertPaymentMethod(
  adminId: string,
  input: MethodFormData,
): Promise<void> {
  await requireAdmin(adminId);
  const m = methodSchema.parse(input);
  const row = {
    id: m.id,
    name: m.name,
    brand_color: m.brandColor || null,
    account_name: m.accountName,
    handle: m.handle,
    pay_link: m.payLink || null,
    note: m.note || null,
    sort_order: m.sortOrder,
    is_active: m.isActive,
  };
  const { error } = await svc()
    .from("payment_methods")
    .upsert(row, { onConflict: "id" });
  if (error) throw new Error("Could not save payment method");
  audit(adminId, "methods.upsert", m.id);
  revalidateSection("/admin/methods");
}

/** Delete a payment method — blocked while deposits reference it. */
export async function deletePaymentMethod(
  adminId: string,
  methodId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().min(1).parse(methodId);
  const client = svc();
  const { count } = await client
    .from("deposits")
    .select("id", { count: "exact", head: true })
    .eq("payment_method_id", methodId);
  if ((count ?? 0) > 0) {
    throw new Error(
      `Cannot delete: ${count} deposit${count === 1 ? "" : "s"} reference this method.`,
    );
  }
  const { error } = await client.from("payment_methods").delete().eq("id", methodId);
  if (error) throw new Error("Could not delete payment method");
  audit(adminId, "methods.delete", methodId);
  revalidateSection("/admin/methods");
}

/* ── Branding ──────────────────────────────────────────────────────────── */

export async function getBranding(): Promise<BrandingRow> {
  const { data } = await svc().from("branding").select("*").eq("id", 1).single();
  const row = (data ?? {}) as Record<string, unknown>;
  const logoPath = (row.logo_path as string | null) ?? null;
  return {
    brandName: (row.brand_name as string) ?? "PlayVault",
    logoPath,
    logoUrl: logoPath ? publicUrl("brand-logos", logoPath) : null,
    signinHeading: (row.signin_heading as string) ?? "Welcome Back",
    signinSubtext:
      (row.signin_subtext as string) ?? "Sign in to continue your lobby journey",
  };
}

const brandingSchema = z.object({
  brandName: z.string().trim().min(1).max(60),
  signinHeading: z.string().trim().min(1).max(80),
  signinSubtext: z.string().trim().max(160),
});

export async function updateBranding(
  adminId: string,
  input: z.input<typeof brandingSchema>,
): Promise<void> {
  await requireAdmin(adminId);
  const b = brandingSchema.parse(input);
  const { error } = await svc().from("branding").upsert({
    id: 1,
    brand_name: b.brandName,
    signin_heading: b.signinHeading,
    signin_subtext: b.signinSubtext,
  });
  if (error) throw new Error("Could not save branding");
  audit(adminId, "branding.update");
  revalidateSection("/admin/branding");
}

/** Upload the brand logo to the public brand-logos bucket. Returns its public URL. */
export async function uploadBrandLogo(
  adminId: string,
  formData: FormData,
): Promise<{ url: string }> {
  await requireAdmin(adminId);
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image must be 8 MB or smaller");

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `logo.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await svc()
    .storage.from("brand-logos")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) throw new Error("Could not upload logo");

  await svc().from("branding").upsert({ id: 1, logo_path: path });
  audit(adminId, "branding.upload_logo");
  revalidateSection("/admin/branding");
  return { url: publicUrl("brand-logos", path) };
}

/* ── Sheet Log ─────────────────────────────────────────────────────────── */

export async function getSheetLog(): Promise<SheetLogRow[]> {
  const client = svc();
  const { data: accounts } = await client
    .from("game_accounts")
    .select("id, username, player_id, game_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  const list = (accounts ?? []) as Array<{
    id: string;
    username: string;
    player_id: string;
    game_id: string;
    status: string;
    created_at: string;
  }>;
  if (list.length === 0) return [];

  const playerIds = [...new Set(list.map((a) => a.player_id))];
  const gameIds = [...new Set(list.map((a) => a.game_id))];

  const [{ data: players }, { data: games }] = await Promise.all([
    client.from("players").select("id, display_name, email").in("id", playerIds),
    client.from("games").select("id, name").in("id", gameIds),
  ]);

  const playerMap = new Map(
    ((players ?? []) as Array<{ id: string; display_name: string; email: string | null }>).map(
      (p) => [p.id, p] as const,
    ),
  );
  const gameMap = new Map(
    ((games ?? []) as Array<{ id: string; name: string }>).map(
      (g) => [g.id, g.name] as const,
    ),
  );

  return list.map((a) => {
    const p = playerMap.get(a.player_id);
    return {
      accountId: a.id,
      username: a.username,
      playerName: p?.display_name ?? "—",
      playerEmail: p?.email ?? null,
      gameName: gameMap.get(a.game_id) ?? a.game_id,
      status: a.status as "creating" | "active",
      createdAt: a.created_at,
    };
  });
}

/* ── Agent Management (super-admin only) ───────────────────────────────── */

export async function getAgents(adminId: string): Promise<AgentRow[]> {
  await requireSuperAdmin(adminId);
  const { data } = await svc()
    .from("admin_users")
    .select("id, email, display_name, role, is_active, created_at, permissions")
    .order("created_at", { ascending: true });
  return ((data ?? []) as Array<{
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
    permissions: unknown;
  }>).map((a) => ({
    id: a.id,
    email: a.email,
    displayName: a.display_name || a.email,
    role: a.role as AdminRole,
    isActive: a.is_active,
    createdAt: a.created_at,
    permissions: parsePermissions(a.permissions, a.role as AdminRole),
  }));
}

const createAgentSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Temporary password must be at least 8 characters"),
  displayName: z.string().trim().min(1).max(80),
});

export async function createAgent(
  adminId: string,
  input: z.input<typeof createAgentSchema>,
): Promise<void> {
  await requireSuperAdmin(adminId);
  const { email, password, displayName } = createAgentSchema.parse(input);
  const client = svc();

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, is_staff: true },
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Could not create agent account");
  }

  const { error: insertError } = await client.from("admin_users").insert({
    id: created.user.id,
    email,
    display_name: displayName,
    role: "agent",
    is_active: true,
  });
  if (insertError) {
    // Avoid an orphaned auth user.
    await client.auth.admin.deleteUser(created.user.id);
    throw new Error("Could not register agent — try again");
  }
  audit(adminId, "agents.create", email);
  revalidateSection("/admin/agents");
}

const updateAgentSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  password: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .optional()
    .or(z.literal("")),
});

export async function updateAgent(
  adminId: string,
  input: z.input<typeof updateAgentSchema>,
): Promise<void> {
  await requireSuperAdmin(adminId);
  const { id, displayName, password } = updateAgentSchema.parse(input);
  const client = svc();

  if (id === adminId) throw new Error("You cannot edit your own account here");

  if (password) {
    const { error } = await client.auth.admin.updateUserById(id, { password });
    if (error) throw new Error("Could not change password");
  }
  const { error } = await client
    .from("admin_users")
    .update({ display_name: displayName })
    .eq("id", id);
  if (error) throw new Error("Could not update agent");
  audit(adminId, "agents.update", id);
  revalidateSection("/admin/agents");
}

export async function toggleAgentActive(
  adminId: string,
  targetId: string,
  isActive: boolean,
): Promise<void> {
  await requireSuperAdmin(adminId);
  z.string().uuid().parse(targetId);
  if (targetId === adminId) throw new Error("You cannot disable your own account");
  const { error } = await svc()
    .from("admin_users")
    .update({ is_active: isActive })
    .eq("id", targetId);
  if (error) throw new Error("Could not change agent status");
  audit(adminId, isActive ? "agents.enable" : "agents.disable", targetId);
  revalidateSection("/admin/agents");
}

const permissionsSchema = z.object({
  player_block: z.boolean(),
  chat_clear: z.boolean(),
  player_delete: z.boolean(),
});

/** Super admin grants/revokes an AGENT's moderation permissions. */
export async function setAgentPermissions(
  adminId: string,
  targetId: string,
  perms: z.input<typeof permissionsSchema>,
): Promise<void> {
  await requireSuperAdmin(adminId);
  z.string().uuid().parse(targetId);
  if (targetId === adminId) {
    throw new Error("Super admin always has all permissions");
  }
  const parsed = permissionsSchema.parse(perms);
  const client = svc();
  const { data: target } = await client
    .from("admin_users")
    .select("role")
    .eq("id", targetId)
    .single();
  if (!target || target.role !== "agent") {
    throw new Error("Permissions can only be set for agents");
  }
  const { error } = await client
    .from("admin_users")
    .update({ permissions: parsed })
    .eq("id", targetId);
  if (error) throw new Error("Could not save permissions");
  audit(adminId, "agents.permissions", `${targetId}:${JSON.stringify(parsed)}`);
  revalidateSection("/admin/agents");
}

/* ── Player moderation (Build 43 — permission-gated) ───────────────────── */

/** Block or unblock a player. Blocked players are locked out of the app. */
export async function setPlayerBlocked(
  adminId: string,
  playerId: string,
  blocked: boolean,
): Promise<void> {
  await requirePermission(adminId, "player_block");
  z.string().uuid().parse(playerId);
  const client = svc();
  const { error } = await client
    .from("players")
    .update(
      blocked
        ? {
            is_blocked: true,
            blocked_at: new Date().toISOString(),
            blocked_by: adminId,
            is_online: false,
          }
        : { is_blocked: false, blocked_at: null, blocked_by: null },
    )
    .eq("id", playerId);
  if (error) throw new Error("Could not update player");
  audit(adminId, blocked ? "player.block" : "player.unblock", playerId);
}

/** Delete a player's ENTIRE chat history (accounts/deposits are kept). */
export async function clearPlayerChat(
  adminId: string,
  playerId: string,
  olderThanDays?: number,
): Promise<void> {
  await requirePermission(adminId, "chat_clear");
  z.string().uuid().parse(playerId);
  const days =
    olderThanDays === undefined
      ? undefined
      : z.number().int().min(1).max(3650).parse(olderThanDays);
  const client = svc();

  // Clear EVERYTHING (accounts/deposits are kept either way).
  if (days === undefined) {
    const { error } = await client
      .from("chat_messages")
      .delete()
      .eq("player_id", playerId);
    if (error) throw new Error("Could not clear chat");
    await client.from("notifications").delete().eq("player_id", playerId);
    audit(adminId, "player.clear_chat", `${playerId}:all`);
    return;
  }

  // Partial clear (Build 55): only rows OLDER than the cutoff are deleted
  // from the database — the recent days stay in chat and in the DB.
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await client
    .from("chat_messages")
    .delete()
    .eq("player_id", playerId)
    .lt("created_at", cutoff);
  if (error) throw new Error("Could not clear chat");
  await client
    .from("notifications")
    .delete()
    .eq("player_id", playerId)
    .lt("created_at", cutoff);
  audit(adminId, "player.clear_chat", `${playerId}:older_than_${days}d`);
}

/**
 * Permanently delete a player: removing the auth user cascades the
 * players row, chat, game accounts, deposits, tags and notes.
 */
export async function deletePlayer(
  adminId: string,
  playerId: string,
): Promise<void> {
  await requirePermission(adminId, "player_delete");
  z.string().uuid().parse(playerId);
  const client = svc();
  const { error } = await client.auth.admin.deleteUser(playerId);
  if (error) throw new Error("Could not delete player");
  audit(adminId, "player.delete", playerId);
}

/* ── Create game account for player (from details panel) ── */

import { generateGamePassword } from "@/lib/crypto";
import { generateUsername } from "@/lib/utils";

export async function createGameAccountForPlayer(
  adminId: string,
  playerId: string,
  gameId: string,
): Promise<void> {
  await requireAdmin(adminId);
  const client = svc();

  // Check if account already exists
  const { data: existing } = await client
    .from("game_accounts")
    .select("id")
    .eq("player_id", playerId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (existing) throw new Error("Account already exists for this game");

  const { error } = await client.from("game_accounts").insert({
    player_id: playerId,
    game_id: gameId,
    username: generateUsername(gameId),
    password_enc: encryptPassword(generateGamePassword()),
    status: "active",
  });
  if (error) throw new Error("Could not create account");

  audit(adminId, "accounts.create", `${playerId}/${gameId}`);
}

/** SEND bar: push a single game to the player's chat. */
export async function sendSingleGame(
  adminId: string,
  playerId: string,
  gameId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(playerId);
  z.string().min(1).parse(gameId); // games.id is TEXT (slug), not uuid (Build 41)
  const { data: game } = await svc()
    .from("games")
    .select("id, name")
    .eq("id", gameId)
    .single();
  if (!game) throw new Error("Game not found");
  const { error } = await svc().from("chat_messages").insert({
    player_id: playerId,
    sender: "admin",
    kind: "games_list",
    body: {
      title: `How about ${(game as { name: string }).name}? Tap to get your account`,
      games: [{ id: (game as { id: string }).id, name: (game as { name: string }).name }],
      picked: null,
    },
    is_read_by_player: false,
    is_read_by_admin: true,
  });
  if (error) throw new Error("Could not send game");
  audit(adminId, "chat.send_single_game", `${playerId}/${gameId}`);
}
