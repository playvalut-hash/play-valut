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
import { computeOnline } from "@/lib/presence";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptPassword, encryptPassword } from "@/lib/crypto";
import { escapeLikePattern, normalizeTag } from "@/lib/utils";
import { isSafeHttpUrl } from "@/lib/urls";
import { maskEmail } from "@/lib/email";
import { resolveGameIconUrl } from "@/lib/game-icon";
import { validateImageFile } from "@/lib/uploads";
import { QUICK_REPLIES } from "./_quick-replies";
import { assertSessionMatches, getSessionUserId } from "./_auth";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type AdminRole = "super_admin" | "agent";

/** Grantable staff permissions (Build 43). Super admin always has all. */
export type StaffPermissionKey =
  | "player_block"
  | "chat_clear"
  | "player_delete"
  | "shortcuts_manage";

export interface StaffPermissions {
  player_block: boolean;
  chat_clear: boolean;
  player_delete: boolean;
  shortcuts_manage: boolean;
}

const ALL_PERMISSIONS: StaffPermissions = {
  player_block: true,
  chat_clear: true,
  player_delete: true,
  shortcuts_manage: true,
};

function parsePermissions(raw: unknown, role: AdminRole): StaffPermissions {
  if (role === "super_admin") return { ...ALL_PERMISSIONS };
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    player_block: r.player_block === true,
    chat_clear: r.chat_clear === true,
    player_delete: r.player_delete === true,
    shortcuts_manage: r.shortcuts_manage === true,
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
  | "system"
  // Side-specific notes (already-active picks): a note only its own side
  // may see. Admin read paths filter the player side's kind out (plus
  // the legacy kind="text" wordings below, which predate these kinds).
  | "player_note"
  | "admin_note";

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
  // Deleted-account placeholder (v2 Phase 2, audit M15): set when an
  // account-kind message's row is gone — the thread renders an explicit
  // "account was deleted" note instead of silently dropping the card.
  deletedGameName?: string | null;
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
  /** True when an admin-uploaded icon overrides the original artwork. */
  hasCustomIcon: boolean;
  /** The original artwork (what Remove restores), resolved like iconUrl. */
  originalIconUrl: string | null;
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

/**
 * Admin audit record (v2 Phase 1, audit H9). Writes to stdout AND, since
 * migration 0017, to the audit_log table. Best-effort by design: a failed
 * insert must never break the action being audited — and before the
 * migration runs, the insert simply fails silently while stdout still has
 * the record. Callers MUST await this (durability in serverless is not
 * guaranteed for fire-and-forget writes).
 */
async function audit(
  adminId: string,
  action: string,
  detail?: string,
): Promise<void> {
  console.info(
    JSON.stringify({
      scope: "admin",
      adminId,
      action,
      detail: detail ?? null,
      at: new Date().toISOString(),
    }),
  );
  try {
    await svc()
      .from("audit_log")
      .insert({
        admin_id: adminId,
        action,
        detail: detail ?? null,
      });
  } catch {
    // stdout above still has the record.
  }
}

/* ── Presence (Build 63) ───────────────────────────────────────────────
 * A player counts as online only when is_online is set AND the last
 * heartbeat is fresh. last_seen_at arrives with migration 0013; until
 * then the separate fail-soft lookup just yields an empty map and the
 * flag alone decides — the inbox never breaks either way.
 * computeOnline itself lives in @/lib/presence (v2 Phase 4, testable). */


async function fetchLastSeenMap(
  client: ReturnType<typeof svc>,
  ids: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  const { data, error } = await client
    .from("players")
    .select("id, last_seen_at")
    .in("id", ids);
  if (error || !data) return map;
  for (const r of data as Array<{ id: string; last_seen_at: string | null }>) {
    map.set(r.id, r.last_seen_at ?? null);
  }
  return map;
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

async function requireAdminRow(adminId: string): Promise<AdminInfo> {
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

/**
 * Session-bound admin check (v2 Phase 1, audit C1). Every mutating admin
 * action funnels through here: the caller must BE the admin id it claims
 * to be, and that admin must be active. requirePermission and
 * requireSuperAdmin delegate to this, so they inherit the binding.
 */
async function requireAdmin(adminId: string): Promise<AdminInfo> {
  await assertSessionMatches(adminId);
  return requireAdminRow(adminId);
}

/**
 * Session-derived admin check for read actions that take no adminId
 * (v2 Phase 1, audit C2). Proves the caller is a signed-in, active admin
 * without trusting anything the client sent.
 */
async function requireSessionAdmin(): Promise<AdminInfo> {
  const sessionId = await getSessionUserId();
  if (!sessionId) throw new Error("Not authorized");
  return requireAdminRow(sessionId);
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

/** Admin sign-in. Every failure returns the SAME message (v2 Phase 2,
 * audit M8): the old code answered "No account found with this email"
 * for unknown emails and "Incorrect password" for known ones — a trivial
 * admin-account enumeration oracle. Now the message reveals nothing,
 * whichever step failed. Residual note: a valid-but-unauthorized account
 * takes one extra round trip (sign-out), so timing still differs
 * slightly; closing that needs dummy-work comparison and is beyond
 * this fix. */
export async function adminSignIn(
  input: z.input<typeof signInSchema>,
): Promise<{ ok: true }> {
  const { email, password } = signInSchema.parse(input);
  const supabase = await createClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error("Invalid email or password");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Invalid email or password");

  const { data: adminRow } = await svc()
    .from("admin_users")
    .select("id, is_active")
    .eq("id", user.id)
    .single();

  if (!adminRow || adminRow.is_active !== true) {
    await supabase.auth.signOut();
    throw new Error("Invalid email or password");
  }
  await audit(user.id, "admin.sign_in");
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

/**
 * Unread notifications, paged (v2 Phase 1, audit H3). The old hard cap of
 * 30 with no way to see older alerts meant staff missed deposit/account
 * alerts during bursts. Defaults preserve the old first page.
 */
export async function getNotifications(opts?: {
  limit?: number;
  offset?: number;
}): Promise<NotificationView[]> {
  await requireSessionAdmin();
  const limit = Math.min(Math.max(opts?.limit ?? NOTIF_LIMIT, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const { data: rows } = await svc()
    .from("notifications")
    .select("id, kind, player_id, preview, created_at")
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

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
  await requireSessionAdmin();
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
  z.string().uuid().parse(notificationId);
  await svc().from("notifications").update({ is_read: true }).eq("id", notificationId);
  await audit(adminId, "notifications.mark_read", notificationId);
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
  // A malformed row must never break the whole inbox (the M2 RPC feeds
  // this same renderer, so guard the shape once, here).
  if (!body || typeof body !== "object") return "—";
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
export type AuditLogRow = {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  detail: string | null;
  createdAt: string;
};

/**
 * Audit trail viewer rows (v2 Phase 1, audit H9). Super-admin only — the
 * log records every admin's actions. Paged newest-first. Before migration
 * 0017 runs, the table does not exist and this returns [] (same safe
 * pattern as the H5 RPC fallback).
 */
export async function getAuditLog(
  adminId: string,
  opts?: { limit?: number; offset?: number },
): Promise<AuditLogRow[]> {
  await requireSuperAdmin(adminId);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const client = svc();
  const { data: rows } = await client
    .from("audit_log")
    .select("id, admin_id, action, detail, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  const list = (rows ?? []) as Array<{
    id: string;
    admin_id: string;
    action: string;
    detail: string | null;
    created_at: string;
  }>;
  if (list.length === 0) return [];
  const adminIds = [...new Set(list.map((r) => r.admin_id))];
  const { data: admins } = await client
    .from("admin_users")
    .select("id, display_name, email")
    .in("id", adminIds);
  const names = new Map(
    ((admins ?? []) as Array<{
      id: string;
      display_name: string;
      email: string;
    }>).map(
      (a) => [a.id, a.display_name || a.email] as const,
    ),
  );
  return list.map((r) => ({
    id: r.id,
    adminId: r.admin_id,
    adminName: names.get(r.admin_id) ?? "Unknown",
    action: r.action,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}

/**
 * Per-player inbox counts (v2 Phase 1, audit H5). One grouped RPC instead
 * of three unbounded row fetches (unread messages, pending deposits,
 * creating accounts) on every poll. Falls back to the old row fetches when
 * the function is not deployed yet (migration 0015), so the inbox never
 * breaks between the code deploy and the SQL run.
 */
/**
 * Latest message per loaded player (v2 Phase 2, audit M2). One RPC call
 * returns exactly one row per messaged player — the old newest-500 window
 * let chatty players crowd quiet ones out, so their rows wrongly showed
 * "No messages yet". Falls back to the old window when the RPC is missing
 * (pre-migration), so the inbox never breaks between code deploy and
 * SQL run.
 */
async function getLatestMessages(
  client: ReturnType<typeof svc>,
  ids: string[],
): Promise<
  Array<{
    player_id: string;
    kind: string;
    body: Record<string, unknown>;
    created_at: string;
  }>
> {
  const { data, error } = await client.rpc("player_latest_messages", {
    player_ids: ids,
  });
  if (!error && data) {
    return data as Array<{
      player_id: string;
      kind: string;
      body: Record<string, unknown>;
      created_at: string;
    }>;
  }
  const { data: recent } = await client
    .from("chat_messages")
    .select("player_id, kind, body, created_at")
    .in("player_id", ids)
    .order("created_at", { ascending: false })
    .limit(500);
  return (recent ?? []) as Array<{
    player_id: string;
    kind: string;
    body: Record<string, unknown>;
    created_at: string;
  }>;
}

async function getOverviewCounts(
  client: ReturnType<typeof svc>,
  ids: string[],
): Promise<{
  unread: Map<string, number>;
  pending: Map<string, number>;
  creating: Map<string, number>;
}> {
  const { data, error } = await client.rpc("player_overview_counts", {
    player_ids: ids,
  });
  if (!error && data) {
    const unread = new Map<string, number>();
    const pending = new Map<string, number>();
    const creating = new Map<string, number>();
    for (const row of data as Array<{
      player_id: string;
      unread_count: number;
      pending_count: number;
      creating_count: number;
    }>) {
      unread.set(row.player_id, Number(row.unread_count));
      pending.set(row.player_id, Number(row.pending_count));
      creating.set(row.player_id, Number(row.creating_count));
    }
    return { unread, pending, creating };
  }
  // Pre-migration fallback: the old row fetches, unchanged behavior.
  const [unreadRes, pendingRes, creatingRes] = await Promise.all([
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
  ]);
  const count = (rows: unknown) => {
    const map = new Map<string, number>();
    for (const r of (rows ?? []) as Array<{ player_id: string }>) {
      map.set(r.player_id, (map.get(r.player_id) ?? 0) + 1);
    }
    return map;
  };
  return {
    unread: count(unreadRes.data),
    pending: count(pendingRes.data),
    creating: count(creatingRes.data),
  };
}

/**
 * Inbox player list (v2 Phase 1, audit H2). Defaults to the newest 100
 * players; pass search/limit/offset to page through the whole base or to
 * search server-side — the old client-only search could never find a
 * player beyond the newest 100. Limit is clamped so a caller cannot ask
 * for an unbounded window.
 */
export async function getInboxOverview(opts?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<PlayerOverview[]> {
  const me = await requireSessionAdmin();
  const client = svc();
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 1000);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const search = opts?.search?.trim();

  let query = client
    .from("players")
    .select("id, display_name, email, avatar_url, is_online, created_at")
    .order("created_at", { ascending: false });
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    query = query.or(`display_name.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data: players } = await query.range(offset, offset + limit - 1);
  const playerList = (players ?? []) as DbPlayer[];
  if (playerList.length === 0) return [];

  const ids = playerList.map((p) => p.id);

  // All independent queries in parallel (was 5 sequential round-trips).
  const [tagsRes, recent, lastSeenMap, countMaps] = await Promise.all([
    client.from("player_tags").select("player_id, tag").in("player_id", ids),
    getLatestMessages(client, ids),
    fetchLastSeenMap(client, ids),
    getOverviewCounts(client, ids),
  ]);

  const { data: tags } = tagsRes;
  const tagMap = new Map<string, string[]>();
  for (const t of ((tags ?? []) as Array<{ player_id: string; tag: string }>)) {
    const arr = tagMap.get(t.player_id) ?? [];
    arr.push(t.tag);
    tagMap.set(t.player_id, arr);
  }

  const unreadMap = countMaps.unread;
  const pendingMap = countMaps.pending;
  const creatingMap = countMaps.creating;

  // Latest message per player (one RPC row each; the fallback window
  // still takes the first per player from its 500 rows).
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
      // Player emails are visible in full to the super admin only;
      // agents get the masked form (server-side, so the full value
      // never reaches an agent's browser). Server-side search above
      // still matches full addresses.
      email:
        me.role === "super_admin" ? p.email : maskEmail(p.email),
      avatarUrl: p.avatar_url,
      isOnline: computeOnline(p.is_online, lastSeenMap.get(p.id)),
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

/**
 * Resolve raw thread rows into ChatMessageView cards (v2 Phase 2, audit
 * M3). Extracted verbatim from getThread so the older-pages action
 * renders identical cards — one resolver, not two copies.
 */
async function resolveThreadViews(
  client: ReturnType<typeof svc>,
  messagesDesc: unknown,
  gamesData: unknown,
  methodsData: unknown,
): Promise<ChatMessageView[]> {
  const messages = ((messagesDesc ?? []) as unknown[]).slice().reverse();
  const games = gamesData;
  const methods = methodsData;
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
    let deletedGameName: string | null = null;
    if (m.kind === "account" && typeof body.account_id === "string") {
      const acc = accountMap.get(body.account_id);
      if (!acc) {
        deletedGameName =
          typeof body.game_id === "string"
            ? (gameNames.get(body.game_id) ?? body.game_id)
            : null;
      } else {
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
      deletedGameName,
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

/** Full chat thread for one player, with card/list payloads resolved server-side. */
/**
 * True when a thread row must NOT reach the admin app: the player's
 * already-created note, new kind or legacy wording. Callers filter with
 * this after fetching (one mechanism for new + legacy rows).
 */
function isPlayerOnlyMessage(m: {
  kind: string;
  sender: string;
  body: Record<string, unknown>;
}): boolean {
  if (m.kind === "player_note") return true;
  if (m.kind !== "text" || m.sender !== "system") return false;
  const text = typeof m.body["text"] === "string" ? m.body["text"] : "";
  if (text === "Your this account is already created — please check here.")
    return true;
  return (
    text.startsWith("You already have a ") &&
    text.includes("right here in our chat")
  );
}

export async function getThread(playerId: string): Promise<ChatMessageView[]> {
  await requireSessionAdmin();
  z.string().uuid().parse(playerId);
  const client = svc();

  // Messages + games + methods in parallel (were sequential).
  const [messagesRes, gamesRes, methodsRes] = await Promise.all([
    client
      .from("chat_messages")
      .select("id, player_id, sender, kind, body, created_at, is_read_by_player, is_read_by_admin")
      .eq("player_id", playerId)
      // LATEST 500, not the OLDEST 200 (Build 42) — older history pages
      // via getThreadOlder below; rows are reversed back to ascending.
      // Secondary id order makes the window boundary deterministic, so
      // the older-pages cursor never skips or repeats a tied row.
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500),
    client.from("games").select("id, name"),
    client.from("payment_methods").select("id, name"),
  ]);

  // Side-specific notes: the player's already-created note never reaches
  // the admin app (new kind + legacy wordings, see isPlayerOnlyMessage).
  const visibleRows = (
    (messagesRes.data ?? []) as Array<{
      kind: string;
      sender: string;
      body: Record<string, unknown>;
    }>
  ).filter((m) => !isPlayerOnlyMessage(m));
  return resolveThreadViews(
    client,
    visibleRows,
    gamesRes.data,
    methodsRes.data,
  );
}

const threadOlderCursorSchema = z.object({
  beforeCreatedAt: z.string().datetime({ offset: true }),
  beforeId: z.string().uuid(),
});

/**
 * One older page of a thread (v2 Phase 2, audit M3). Cursor is the
 * oldest message currently shown: strictly older rows, with (created_at,
 * id) ordering so same-timestamp ties never gap or repeat. Limit+1
 * reports hasMore exactly. Same card resolution as getThread.
 */
export async function getThreadOlder(
  playerId: string,
  rawCursor: z.input<typeof threadOlderCursorSchema>,
): Promise<{ messages: ChatMessageView[]; hasMore: boolean }> {
  await requireSessionAdmin();
  const { beforeCreatedAt, beforeId } = threadOlderCursorSchema.parse(rawCursor);
  const client = svc();
  const [messagesRes, gamesRes, methodsRes] = await Promise.all([
    client
      .from("chat_messages")
      .select("id, player_id, sender, kind, body, created_at, is_read_by_player, is_read_by_admin")
      .eq("player_id", playerId)
      .or(
        `created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`,
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(201),
    client.from("games").select("id, name"),
    client.from("payment_methods").select("id, name"),
  ]);
  const rows = ((messagesRes.data ?? []) as unknown[]).slice();
  const hasMore = rows.length > 200;
  const page = hasMore ? rows.slice(0, 200) : rows;
  // Side-specific notes (see isPlayerOnlyMessage): the player's
  // already-created note never reaches the admin app. hasMore stays
  // computed on raw rows — there are more rows below, just filtered.
  const visiblePage = (
    page as Array<{
      kind: string;
      sender: string;
      body: Record<string, unknown>;
    }>
  ).filter((m) => !isPlayerOnlyMessage(m));
  const views = await resolveThreadViews(
    client,
    visiblePage,
    gamesRes.data,
    methodsRes.data,
  );
  return { messages: views, hasMore };
}

/** Mark the whole thread as read by admin when the agent opens it. */
export async function markThreadRead(
  adminId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(playerId);
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
  await audit(adminId, "chat.send_message", playerId);
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
  await audit(adminId, "chat.quick_reply", `${playerId}:${key}`);
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
  await audit(adminId, "chat.send_games_list", playerId);
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
  await audit(adminId, "chat.send_pay_list", playerId);
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
  await audit(adminId, "chat.send_single_method", `${playerId}/${methodId}`);
}

/* ── Inbox: player detail (tags, notes, accounts, deposits) ─────────────── */

export async function getPlayerDetail(
  playerId: string,
): Promise<PlayerDetailView | null> {
  const me = await requireSessionAdmin();
  z.string().uuid().parse(playerId);
  const client = svc();
  const { data: player } = await client
    .from("players")
    .select("id, display_name, email, avatar_url, is_online, is_blocked, blocked_at")
    .eq("id", playerId)
    .single();
  if (!player) return null;
  const lastSeenMap = await fetchLastSeenMap(client, [playerId]);

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
      email:
        me.role === "super_admin"
          ? ((player.email as string | null) ?? null)
          : maskEmail(player.email as string | null),
      avatarUrl: (player.avatar_url as string | null) ?? null,
      isOnline: computeOnline((player.is_online as boolean) ?? false, lastSeenMap.get(playerId)),
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
  await audit(adminId, "tags.add", `${playerId}:${normalized}`);
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
  await audit(adminId, "tags.remove", `${playerId}:${normalized}`);
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
  await audit(adminId, "notes.add", playerId);
}

export async function deletePlayerNote(
  adminId: string,
  noteId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(noteId);
  const { error } = await svc().from("player_notes").delete().eq("id", noteId);
  if (error) throw new Error("Could not delete note");
  await audit(adminId, "notes.delete", noteId);
}

/* ── Inbox: game accounts (edit / delete / mark active) ─────────────────── */

const editAccountSchema = z.object({
  accountId: z.string().uuid(),
  username: z.string().trim().min(3).max(64),
  password: z.string().min(12).max(128).optional(),
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
    .select("id, player_id, game_id")
    .eq("id", accountId)
    .single();
  if (!existing) throw new Error("Account not found");

  // Per-game username uniqueness on manual edit (v2 Phase 2, audit
  // M12): the H6 unique index already rejects duplicates at the DB,
  // but with a cryptic error — this pre-check gives the admin a clear
  // message instead. The account itself is excluded, so saving
  // unchanged still works.
  const { data: clash } = await client
    .from("game_accounts")
    .select("id")
    .eq("game_id", (existing as { game_id: string }).game_id)
    .eq("username", username)
    .neq("id", accountId)
    .maybeSingle();
  if (clash) {
    throw new Error("Another account already uses this username for this game");
  }

  const patch: Record<string, string> = { username };
  if (password) patch.password_enc = encryptPassword(password);
  const { error } = await client
    .from("game_accounts")
    .update(patch)
    .eq("id", accountId);
  if (error) throw new Error("Could not update account");
  await audit(adminId, "accounts.edit", `${accountId} player=${existing.player_id}`);
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
  await audit(adminId, "accounts.delete", `${accountId} player=${existing.player_id}`);
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
  const validated = await validateImageFile(entry, 8 * 1024 * 1024);
  const client = svc();
  const path = `${playerId}/${crypto.randomUUID()}.${validated.extension}`;
  const { error: upError } = await client.storage
    .from("screenshots")
    .upload(path, validated.bytes, {
      contentType: validated.contentType,
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
  if (error) {
    // Orphaned-upload cleanup (v2 Phase 2, audit M11): the file is
    // already in storage under a random path nothing references, so a
    // failed message insert must remove it now — not leave it for the
    // Storage-page sweep. Best-effort: a failed remove never masks the
    // original error, and the sweep remains the backstop.
    await client.storage.from("screenshots").remove([path]);
    throw new Error("Couldn't send the image. Try again.");
  }
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
  // The flip itself is conditional (audit H8): a concurrent activation
  // wins the row, and this call sees zero affected rows and returns early
  // — before any card flip or ready message — exactly like the sequential
  // already-active return above.
  const [updateRes, cardMsgRes, gameRes] = await Promise.all([
    client
      .from("game_accounts")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", accountId)
      .eq("status", "creating")
      .select("id"),
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
  if (!updateRes.data || (updateRes.data as unknown[]).length === 0) {
    return; // Activated concurrently — nothing left to do.
  }

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

  await audit(adminId, `accounts.mark_active by=${me.displayName}`, accountId);
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
  await audit(adminId, "accounts.reveal_password", accountId);
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

  // Atomic decision (v2 Phase 1, audit H8): the update itself carries the
  // status condition, so two concurrent approves cannot both succeed — the
  // loser sees zero affected rows and throws BEFORE any chat message is
  // sent. The read above stays for existence + the message payload only.
  const { data: decided, error } = await client
    .from("deposits")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    })
    .eq("id", depositId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error("Could not approve deposit");
  if (!decided || decided.length === 0) {
    throw new Error("Deposit already decided");
  }

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

  await audit(adminId, "deposits.approve", `${depositId} amount=${deposit.amount}`);
  // Retention sweep, best-effort — never blocks the decision (audit H7).
  await sweepScreenshotRetentionBestEffort();
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

  // Atomic decision (audit H8) — see approveDeposit.
  const { data: decided, error } = await client
    .from("deposits")
    .update({
      status: "rejected",
      admin_note: note || null,
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    })
    .eq("id", depositId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error("Could not reject deposit");
  if (!decided || decided.length === 0) {
    throw new Error("Deposit already decided");
  }

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

  await audit(adminId, "deposits.reject", depositId);
  // Retention sweep, best-effort — never blocks the decision (audit H7).
  await sweepScreenshotRetentionBestEffort();
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
  await audit(adminId, "screenshots.mint_url", path);
  return url;
}

/* ── Games Library ─────────────────────────────────────────────────────── */

function toGameRow(g: Record<string, unknown>): GameRow {
  const iconPath = (g.icon_path as string | null) ?? null;
  const customIconPath = (g.custom_icon_path as string | null) ?? null;
  return {
    id: g.id as string,
    name: g.name as string,
    category: (g.category as string | null) ?? null,
    iconPath,
    // One shared rule (see src/lib/game-icon.ts): a custom upload wins
    // everywhere; otherwise the original artwork shows. getGames uses
    // select("*"), so a not-yet-migrated DB simply yields no custom
    // column and the original shows — no error before migration 0024.
    iconUrl: resolveGameIconUrl(iconPath, customIconPath),
    hasCustomIcon: !!customIconPath,
    originalIconUrl: resolveGameIconUrl(iconPath, null),
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
  await requireSessionAdmin();
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
  link: z.string().trim().max(500).optional().default("").refine(
    (v) => v === "" || isSafeHttpUrl(v),
    "Link must start with http:// or https://",
  ),
  webLink: z.string().trim().max(500).optional().default("").refine(
    (v) => v === "" || isSafeHttpUrl(v),
    "Link must start with http:// or https://",
  ),
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
  await audit(adminId, "games.upsert", g.id);
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
  await audit(adminId, "games.delete", gameId);
  revalidateSection("/admin/games");
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Upload a game icon to the public game-icons bucket.
 *  The upload becomes the game's CUSTOM icon (custom_icon_path) — the
 *  original artwork in icon_path is never overwritten, so Remove can
 *  always bring it back. Needs migration 0024 (custom_icon_path).
 *
 *  Returns (never throws) a result: thrown action errors surface in
 *  production as a minified React digest instead of the message, so a
 *  user-facing explanation must travel as data. Auth failures still
 *  throw, as elsewhere. */
export async function uploadGameIcon(
  adminId: string,
  formData: FormData,
): Promise<
  | { ok: true; path: string; url: string }
  | { ok: false; error: string }
> {
  await requireAdmin(adminId);
  const gameId = String(formData.get("gameId") ?? "");
  const file = formData.get("file");
  if (!gameId) return { ok: false, error: "No game selected" };
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  const validated = await validateImageFile(file, MAX_UPLOAD_BYTES);
  const path = `${gameId}.${validated.extension}`;
  const client = svc();
  const { data: current } = await client
    .from("games")
    .select("custom_icon_path")
    .eq("id", gameId)
    .maybeSingle();
  const oldPath =
    (current as { custom_icon_path?: string | null } | null)
      ?.custom_icon_path ?? null;
  const { error: uploadError } = await client.storage
    .from("game-icons")
    .upload(path, validated.bytes, { contentType: validated.contentType, upsert: true });
  if (uploadError) return { ok: false, error: "Could not upload icon" };

  const { error: updateError } = await client
    .from("games")
    .update({ custom_icon_path: path })
    .eq("id", gameId);
  if (updateError) {
    // Don't leave an orphan behind when the DB write fails.
    await client.storage.from("game-icons").remove([path]);
    if (/custom_icon_path/.test(updateError.message ?? "")) {
      return {
        ok: false,
        error:
          "Custom icons need migration 0024 — please run it in the SQL Editor first.",
      };
    }
    return { ok: false, error: "Could not upload icon" };
  }
  // A replaced upload with a different extension orphans the old file.
  if (oldPath && oldPath !== path) {
    await client.storage.from("game-icons").remove([oldPath]);
  }
  await audit(adminId, "games.upload_icon", gameId);
  revalidateSection("/admin/games");
  return { path, url: publicUrl("game-icons", path), ok: true };
}

/** Remove a game's custom icon — the original artwork shows everywhere again.
 *  The stored upload is deleted too (best-effort); the column clear is
 *  what restores the original, so a storage failure never blocks it.
 *  Returns a result (see uploadGameIcon for why it never throws). */
export async function clearCustomGameIcon(
  adminId: string,
  gameId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin(adminId);
  z.string().min(1).parse(gameId);
  const client = svc();
  const { data: current } = await client
    .from("games")
    .select("custom_icon_path")
    .eq("id", gameId)
    .maybeSingle();
  const oldPath =
    (current as { custom_icon_path?: string | null } | null)
      ?.custom_icon_path ?? null;
  const { error } = await client
    .from("games")
    .update({ custom_icon_path: null })
    .eq("id", gameId);
  if (error) {
    if (/custom_icon_path/.test(error.message ?? "")) {
      return {
        ok: false,
        error:
          "Custom icons need migration 0024 — please run it in the SQL Editor first.",
      };
    }
    return { ok: false, error: "Could not remove icon" };
  }
  if (oldPath) {
    await client.storage.from("game-icons").remove([oldPath]);
  }
  await audit(adminId, "games.clear_custom_icon", gameId);
  revalidateSection("/admin/games");
  return { ok: true };
}

/* ── Payment Methods ───────────────────────────────────────────────────── */

export async function getPaymentMethods(): Promise<PaymentMethodRow[]> {
  await requireSessionAdmin();
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
  payLink: z.string().trim().max(500).optional().default("").refine(
    (v) => v === "" || isSafeHttpUrl(v),
    "Link must start with http:// or https://",
  ),
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
  await audit(adminId, "methods.upsert", m.id);
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
  await audit(adminId, "methods.delete", methodId);
  revalidateSection("/admin/methods");
}

/* ── Branding ──────────────────────────────────────────────────────────── */

/* Intentionally public (audit C2 review): returns ONLY brand display fields
 * (name, logo URL, sign-in heading/subtext) and is rendered by the public
 * login/signup pages and the player app. No admin data, no secrets — gating
 * it would break those pages, so it is excluded from requireSessionAdmin. */
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
  await audit(adminId, "branding.update");
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
  const validated = await validateImageFile(file, MAX_UPLOAD_BYTES);
  const path = `logo.${validated.extension}`;
  const { error: uploadError } = await svc()
    .storage.from("brand-logos")
    .upload(path, validated.bytes, { contentType: validated.contentType, upsert: true });
  if (uploadError) throw new Error("Could not upload logo");

  await svc().from("branding").upsert({ id: 1, logo_path: path });
  await audit(adminId, "branding.upload_logo");
  revalidateSection("/admin/branding");
  return { url: publicUrl("brand-logos", path) };
}

/* ── Sheet Log ─────────────────────────────────────────────────────────── */

export async function getSheetLog(): Promise<SheetLogRow[]> {
  const me = await requireSessionAdmin();
  const client = svc();

  // Full export, no silent cap (v2 Phase 2, audit M14): the old
  // .limit(2000) quietly dropped every account past the newest 2,000
  // from the admin's copy-to-Sheets table. Accounts are now fetched in
  // 1,000-row ranges until a short page ends the loop, and the
  // player/game lookups are chunked too — a 10,000-account export
  // would otherwise blow past PostgREST URL limits with one giant IN
  // list. This page is a rarely-opened admin tool, so completeness
  // wins over payload size here.
  const PAGE = 1000;
  type AccountRow = {
    id: string;
    username: string;
    player_id: string;
    game_id: string;
    status: string;
    created_at: string;
  };
  const list: AccountRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: page } = await client
      .from("game_accounts")
      .select("id, username, player_id, game_id, status, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE - 1);
    const rows = (page ?? []) as AccountRow[];
    list.push(...rows);
    if (rows.length < PAGE) break;
  }
  if (list.length === 0) return [];

  const playerIds = [...new Set(list.map((a) => a.player_id))];
  const gameIds = [...new Set(list.map((a) => a.game_id))];

  const fetchInChunks = async <T>(
    table: string,
    columns: string,
    ids: string[],
  ): Promise<T[]> => {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await client
        .from(table)
        .select(columns)
        .in("id", ids.slice(i, i + 500));
      out.push(...((data ?? []) as T[]));
    }
    return out;
  };

  const [players, games] = await Promise.all([
    fetchInChunks<{ id: string; display_name: string; email: string | null }>(
      "players",
      "id, display_name, email",
      playerIds,
    ),
    fetchInChunks<{ id: string; name: string }>("games", "id, name", gameIds),
  ]);

  const playerMap = new Map(players.map((p) => [p.id, p] as const));
  const gameMap = new Map(games.map((g) => [g.id, g.name] as const));

  return list.map((a) => {
    const p = playerMap.get(a.player_id);
    return {
      accountId: a.id,
      username: a.username,
      playerName: p?.display_name ?? "—",
      playerEmail:
        me.role === "super_admin"
          ? (p?.email ?? null)
          : maskEmail(p?.email ?? null),
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
  await audit(adminId, "agents.create", email);
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
  await audit(adminId, "agents.update", id);
  revalidateSection("/admin/agents");
}

export async function toggleAgentActive(
  adminId: string,
  targetId: string,
  isActive: boolean,
): Promise<void> {
  await requireSuperAdmin(adminId);
  z.string().uuid().parse(targetId);
  z.boolean().parse(isActive);
  if (targetId === adminId) throw new Error("You cannot disable your own account");
  const { error } = await svc()
    .from("admin_users")
    .update({ is_active: isActive })
    .eq("id", targetId);
  if (error) throw new Error("Could not change agent status");
  await audit(adminId, isActive ? "agents.enable" : "agents.disable", targetId);
  revalidateSection("/admin/agents");
}

const permissionsSchema = z.object({
  player_block: z.boolean(),
  chat_clear: z.boolean(),
  player_delete: z.boolean(),
  shortcuts_manage: z.boolean(),
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
  await audit(adminId, "agents.permissions", `${targetId}:${JSON.stringify(parsed)}`);
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
  z.boolean().parse(blocked);
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
  await audit(adminId, blocked ? "player.block" : "player.unblock", playerId);
}

/* ── Screenshot storage lifecycle (v2 Phase 1, audit H7) ─────────────── */

/**
 * User decision (2026-10-24): EVERY screenshot — deposit proofs and chat
 * images alike — is deleted 30 days after its owning event (deposit
 * decision / message share). Clearing a chat deletes its screenshots
 * IMMEDIATELY, both kinds, from storage and from the database references.
 * Sharp edge, recorded deliberately: clearing a player who has a PENDING
 * deposit deletes that deposit's proof too (the row stays, the screenshot
 * is gone, the player must resend). That is the user's explicit
 * instruction, not an oversight — do not "fix" it back.
 */
const SCREENSHOT_RETENTION_DAYS = 30;
const STORAGE_REMOVE_CHUNK = 100;

function retentionCutoffIso(): string {
  return new Date(
    Date.now() - SCREENSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/** screenshot_path values out of chat shot-message bodies. */
function shotPaths(rows: Array<{ body: unknown }>): string[] {
  const out: string[] = [];
  for (const row of rows ?? []) {
    const body = row.body as { screenshot_path?: unknown } | null;
    if (body && typeof body.screenshot_path === "string" && body.screenshot_path) {
      out.push(body.screenshot_path);
    }
  }
  return out;
}

/**
 * Best-effort batch removal from the private screenshots bucket. Never
 * throws: a money/user action must not fail because cleanup failed —
 * leftovers are caught by the next sweep. Returns the paths actually
 * removed, so callers null only references that are really gone.
 */
async function removeScreenshotObjects(paths: string[]): Promise<string[]> {
  const unique = [...new Set(paths.filter((p) => p.length > 0))];
  if (unique.length === 0) return [];
  const client = svc();
  const removed: string[] = [];
  for (let i = 0; i < unique.length; i += STORAGE_REMOVE_CHUNK) {
    const chunk = unique.slice(i, i + STORAGE_REMOVE_CHUNK);
    const { error } = await client.storage.from("screenshots").remove(chunk);
    if (!error) removed.push(...chunk);
  }
  return removed;
}

/**
 * Deletes screenshots of deposits decided more than 30 days ago and nulls
 * their deposit references. Pending deposits are NEVER touched here.
 * Bounded: one batch per call; the manual sweep loops. Returns the number
 * of screenshots deleted.
 */
async function sweepDecidedDepositScreenshots(batchSize = 500): Promise<number> {
  const client = svc();
  const { data: rows } = await client
    .from("deposits")
    .select("id, screenshot_path")
    .in("status", ["approved", "rejected"])
    .lt("decided_at", retentionCutoffIso())
    .not("screenshot_path", "is", null)
    .limit(batchSize);
  const list = (rows ?? []) as Array<{ id: string; screenshot_path: string }>;
  if (list.length === 0) return 0;
  const removed = await removeScreenshotObjects(
    list.map((d) => d.screenshot_path),
  );
  if (removed.length === 0) return 0;
  const removedSet = new Set(removed);
  const ids = list
    .filter((d) => removedSet.has(d.screenshot_path))
    .map((d) => d.id);
  if (ids.length > 0) {
    await client
      .from("deposits")
      .update({ screenshot_path: null })
      .in("id", ids);
  }
  return removed.length;
}

/**
 * Deletes objects of shot messages shared more than 30 days ago, EXCEPT
 * paths still referenced by a deposit row — those belong to the deposit
 * sweep, so a pending deposit's proof survives its chat message aging out.
 * The message rows stay (caption intact); only the image goes — both chat
 * UIs already render a placeholder for a missing screenshot. Bounded: one
 * batch per call. Returns the number of screenshots deleted.
 */
async function sweepOldChatScreenshots(batchSize = 200): Promise<number> {
  const client = svc();
  const { data: rows } = await client
    .from("chat_messages")
    .select("body")
    .eq("kind", "shot")
    .lt("created_at", retentionCutoffIso())
    .limit(batchSize);
  const paths = shotPaths((rows ?? []) as Array<{ body: unknown }>);
  if (paths.length === 0) return 0;
  const { data: owned } = await client
    .from("deposits")
    .select("screenshot_path")
    .in("screenshot_path", paths);
  const ownedSet = new Set(
    ((owned ?? []) as Array<{ screenshot_path: string }>).map(
      (d) => d.screenshot_path,
    ),
  );
  const free = paths.filter((p) => !ownedSet.has(p));
  const removed = await removeScreenshotObjects(free);
  return removed.length;
}

/**
 * Retention sweep after a deposit decision. Best-effort by design: a sweep
 * failure must never fail the decision itself — the next decision or the
 * manual sweep retries.
 */
async function sweepScreenshotRetentionBestEffort(): Promise<void> {
  try {
    await sweepDecidedDepositScreenshots(500);
    await sweepOldChatScreenshots(200);
  } catch {
    // Next decision / manual sweep retries.
  }
}

/**
 * Objects in the screenshots bucket with no live reference (left behind by
 * pre-fix clears/deletes, when rows were removed but objects were not).
 * Bucket layout: every upload lives under its owner's id folder
 * (`<playerId>/<uuid>.<ext>`), so root entries without a "." are folders
 * and entries with one are stray root files. List order is by name, so a
 * capped run still makes progress: deleted orphans are gone on re-run.
 */
async function findOrphanScreenshotPaths(
  cap: number,
): Promise<{ paths: string[]; capped: boolean }> {
  const client = svc();
  const referenced = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await client
      .from("deposits")
      .select("screenshot_path")
      .not("screenshot_path", "is", null)
      .range(offset, offset + 999);
    const rows = (data ?? []) as Array<{ screenshot_path: string }>;
    for (const r of rows) referenced.add(r.screenshot_path);
    if (rows.length < 1000) break;
  }
  for (let offset = 0; ; offset += 1000) {
    const { data } = await client
      .from("chat_messages")
      .select("body")
      .eq("kind", "shot")
      .range(offset, offset + 999);
    const rows = (data ?? []) as Array<{ body: unknown }>;
    for (const path of shotPaths(rows)) referenced.add(path);
    if (rows.length < 1000) break;
  }
  const orphans: string[] = [];
  let capped = false;
  for (let rootOffset = 0; !capped; rootOffset += 100) {
    const { data: root } = await client.storage
      .from("screenshots")
      .list("", { limit: 100, offset: rootOffset });
    const entries = (root ?? []) as Array<{ name: string }>;
    if (entries.length === 0) break;
    for (const entry of entries) {
      if (!entry.name) continue;
      if (entry.name.includes(".")) {
        if (!referenced.has(entry.name)) orphans.push(entry.name);
        continue;
      }
      for (let offset = 0; !capped; offset += 100) {
        const { data: files } = await client.storage
          .from("screenshots")
          .list(entry.name, { limit: 100, offset });
        const names = (files ?? []).map((f) => f.name).filter(Boolean);
        for (const name of names) {
          const path = `${entry.name}/${name}`;
          if (!referenced.has(path)) orphans.push(path);
          if (orphans.length >= cap) {
            capped = true;
            break;
          }
        }
        if (names.length < 100) break;
      }
      if (capped) break;
    }
    if (entries.length < 100) break;
  }
  return { paths: orphans, capped };
}

/**
 * Manual storage cleanup (super-admin only, Storage page): retention
 * sweeps looped to completion plus the orphan diff. Reports counts and
 * whether a cap stopped the run early (run again to continue).
 */
export async function runStorageCleanup(adminId: string): Promise<{
  decided: number;
  chat: number;
  orphans: number;
  capped: boolean;
}> {
  await requireSuperAdmin(adminId);
  let decided = 0;
  let chat = 0;
  let capped = false;
  for (let i = 0; i < 20; i++) {
    const n = await sweepDecidedDepositScreenshots(1000);
    decided += n;
    if (n < 1000) break;
    if (i === 19) capped = true;
  }
  for (let i = 0; i < 20; i++) {
    const n = await sweepOldChatScreenshots(500);
    chat += n;
    if (n < 500) break;
    if (i === 19) capped = true;
  }
  const { paths, capped: orphanCapped } =
    await findOrphanScreenshotPaths(1000);
  if (orphanCapped) capped = true;
  const removed = await removeScreenshotObjects(paths);
  await audit(
    adminId,
    "storage.cleanup",
    `decided=${decided} chat=${chat} orphans=${removed.length} capped=${capped}`,
  );
  return { decided, chat, orphans: removed.length, capped };
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

  // Shot paths in scope FIRST (audit H7, user decision 2026-10-24): the
  // rows are about to disappear, and with them the only record of which
  // objects to delete. Clearing deletes the screenshots IMMEDIATELY, both
  // deposit proofs and chat images — not after 30 days.
  let shotQuery = client
    .from("chat_messages")
    .select("body")
    .eq("player_id", playerId)
    .eq("kind", "shot");
  if (days !== undefined) {
    shotQuery = shotQuery.lt(
      "created_at",
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    );
  }
  const { data: shots } = await shotQuery;
  const paths = shotPaths((shots ?? []) as Array<{ body: unknown }>);

  // Clear EVERYTHING (deposit/game-account ROWS are kept either way).
  if (days === undefined) {
    const { error } = await client
      .from("chat_messages")
      .delete()
      .eq("player_id", playerId);
    if (error) throw new Error("Could not clear chat");
    await client.from("notifications").delete().eq("player_id", playerId);
    await audit(adminId, "player.clear_chat", `${playerId}:all`);
  } else {
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
    await audit(adminId, "player.clear_chat", `${playerId}:older_than_${days}d`);
  }

  // Storage, best-effort after the rows are gone: delete the objects and
  // null the deposit references that pointed at them (a cleared pending
  // deposit keeps its row but loses its proof — see the H7 decision note).
  if (paths.length > 0) {
    const removed = await removeScreenshotObjects(paths);
    if (removed.length > 0) {
      await client
        .from("deposits")
        .update({ screenshot_path: null })
        .eq("player_id", playerId)
        .in("screenshot_path", removed);
    }
  }
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
  await audit(adminId, "player.delete", playerId);
  // Storage (audit H7): the auth cascade removes the rows but not the
  // player's screenshots — delete the whole prefix, best-effort. Re-list
  // from the start after each batch: offset pagination would skip entries
  // as rows shift under deletion.
  try {
    for (let i = 0; i < 50; i++) {
      const { data: files } = await client.storage
        .from("screenshots")
        .list(playerId, { limit: 100 });
      const names = (files ?? [])
        .map((f) => f.name)
        .filter((n) => n && !n.endsWith("/"));
      if (names.length === 0) break;
      await client.storage
        .from("screenshots")
        .remove(names.map((n) => `${playerId}/${n}`));
      if (names.length < 100) break;
    }
  } catch {
    // Leftovers are caught by the manual storage sweep.
  }
}

/* ── Create game account for player (from details panel) ── */

import { generateGamePassword } from "@/lib/crypto";
import { insertGameAccountWithUniqueUsername } from "@/lib/utils";

export async function createGameAccountForPlayer(
  adminId: string,
  playerId: string,
  gameId: string,
): Promise<void> {
  await requireAdmin(adminId);
  z.string().uuid().parse(playerId);
  z.string().min(1).parse(gameId); // games.id is TEXT (slug), not uuid (Build 41)
  const client = svc();

  const { data: game } = await client
    .from("games")
    .select("id, name")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) throw new Error("Game not found");
  const gameName = (game as { name: string }).name;

  // Check if account already exists
  const { data: existing } = await client
    .from("game_accounts")
    .select("id")
    .eq("player_id", playerId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (existing) {
    throw new Error(`This player already has a ${gameName} account`);
  }

  // Status starts at "creating" — NOT active. The admin verifies it from
  // the card in the thread (markAccountActive), like a chat-requested
  // account. (Build 62: this used to insert "active" directly and never
  // sent anything to the player, so Create looked broken.)
  // Username collisions with other players are retried inside the helper
  // (audit H6); a (player_id, game_id) race surfaces as "already has".
  const inserted = await insertGameAccountWithUniqueUsername(gameId, {
    tryInsert: async (username) => {
      const { data, error } = await client
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
      const { data: retry } = await client
        .from("game_accounts")
        .select("id")
        .eq("player_id", playerId)
        .eq("game_id", gameId)
        .maybeSingle();
      if (!retry) return null;
      return { id: (retry as { id: string }).id, status: "creating" as const };
    },
  });
  if (!inserted) throw new Error("Could not create account");
  if (!inserted.created) {
    throw new Error(`This player already has a ${gameName} account`);
  }
  const accountId = inserted.id;

  // Send it to the player in chat, exactly like a requested account:
  // a short setup note, a human beat, then the CREATING card.
  // Atomicity (v2 Phase 2, audit M4): the three writes used to run
  // unchecked — a failed note/card insert succeeded SILENTLY, leaving an
  // orphan "creating" account with no card (recoverable only from the
  // panel, confusing for the player). Now every write is checked, and
  // any failure after the account insert rolls the sequence back
  // (note message + account row, best-effort) before the error surfaces.
  // Residual gap, stated plainly: a process crash during the 900 ms beat
  // still orphans — closing that needs a single-transaction RPC, which
  // cannot encrypt the password (the key lives server-side only).
  let noteId: string | null = null;
  try {
    const { data: note, error: noteError } = await client
      .from("chat_messages")
      .insert({
        player_id: playerId,
        sender: "system",
        kind: "text",
        body: { text: `Setting up your ${gameName} account — give me just a sec 👍` },
        is_read_by_player: false,
        is_read_by_admin: true,
      })
      .select("id")
      .single();
    if (noteError || !note) throw new Error("Could not send setup note");
    noteId = (note as { id: string }).id;
    void broadcastAgentTyping(playerId);
    await sleep(900);
    const { error: cardError } = await client.from("chat_messages").insert({
      player_id: playerId,
      sender: "system",
      kind: "account",
      body: { game_id: gameId, account_id: accountId, status: "creating" },
      is_read_by_player: false,
      is_read_by_admin: true,
    });
    if (cardError) throw new Error("Could not send account card");
  } catch (err) {
    if (noteId) {
      await client.from("chat_messages").delete().eq("id", noteId);
    }
    const { error: cleanupError } = await client
      .from("game_accounts")
      .delete()
      .eq("id", accountId);
    if (cleanupError) {
      await audit(
        adminId,
        "accounts.create_cleanup_failed",
        `${playerId}/${gameId}/${accountId}`,
      );
    }
    throw err;
  }

  await audit(adminId, "accounts.create", `${playerId}/${gameId}`);
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
  await audit(adminId, "chat.send_single_game", `${playerId}/${gameId}`);
}

/* ── Text shortcuts (Build 59) ───────────────────────────────────────────
 * Blaze-style text expander: centrally managed by the super admin (or an
 * agent granted "shortcuts_manage"); every staff member can USE the
 * enabled shortcuts in any admin chat. Storage: text_shortcuts (0012).
 * All reads/writes are permission-checked server-side. */

export interface TextShortcut {
  id: string;
  key: string;
  expansion: string;
  description: string | null;
  isEnabled: boolean;
  updatedAt: string;
}

const shortcutInputSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9_-]{0,31}$/,
      "Shortcut must be 1–32 chars: letters, numbers, - or _ (no spaces)",
    ),
  expansion: z
    .string()
    .trim()
    .min(1, "Expansion text can't be empty")
    .max(2000, "Expansion is too long (2000 chars max)"),
  description: z.string().trim().max(120, "Description is too long").optional(),
});

type ShortcutRow = {
  id: string;
  key: string;
  expansion: string;
  description: string | null;
  is_enabled: boolean;
  updated_at: string;
};

function toTextShortcut(r: ShortcutRow): TextShortcut {
  return {
    id: r.id,
    key: r.key,
    expansion: r.expansion,
    description: r.description,
    isEnabled: r.is_enabled,
    updatedAt: r.updated_at,
  };
}

function shortcutError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("That shortcut key is already taken — pick another one.");
  }
  return new Error("Could not save the shortcut. Try again.");
}

export async function getShortcuts(adminId: string): Promise<TextShortcut[]> {
  await requirePermission(adminId, "shortcuts_manage");
  const { data, error } = await svc()
    .from("text_shortcuts")
    .select("id, key, expansion, description, is_enabled, updated_at")
    .order("key", { ascending: true });
  if (error) throw new Error("Could not load shortcuts");
  return ((data ?? []) as ShortcutRow[]).map(toTextShortcut);
}

export async function createShortcut(
  adminId: string,
  input: { key: string; expansion: string; description?: string },
): Promise<TextShortcut> {
  const me = await requirePermission(adminId, "shortcuts_manage");
  const parsed = shortcutInputSchema.parse(input);
  const { data, error } = await svc()
    .from("text_shortcuts")
    .insert({
      key: parsed.key,
      expansion: parsed.expansion,
      description: parsed.description || null,
      created_by: me.id,
    })
    .select("id, key, expansion, description, is_enabled, updated_at")
    .single();
  if (error) throw shortcutError(error);
  revalidateSection("/admin/shortcuts");
  return toTextShortcut(data as ShortcutRow);
}

export async function updateShortcut(
  adminId: string,
  id: string,
  input: { key: string; expansion: string; description?: string },
): Promise<TextShortcut> {
  await requirePermission(adminId, "shortcuts_manage");
  z.string().uuid().parse(id);
  const parsed = shortcutInputSchema.parse(input);
  const { data, error } = await svc()
    .from("text_shortcuts")
    .update({
      key: parsed.key,
      expansion: parsed.expansion,
      description: parsed.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, key, expansion, description, is_enabled, updated_at")
    .single();
  if (error) throw shortcutError(error);
  revalidateSection("/admin/shortcuts");
  return toTextShortcut(data as ShortcutRow);
}

export async function setShortcutEnabled(
  adminId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  await requirePermission(adminId, "shortcuts_manage");
  z.string().uuid().parse(id);
  const { error } = await svc()
    .from("text_shortcuts")
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Could not update the shortcut");
  revalidateSection("/admin/shortcuts");
}

export async function deleteShortcut(adminId: string, id: string): Promise<void> {
  await requirePermission(adminId, "shortcuts_manage");
  z.string().uuid().parse(id);
  const { error } = await svc().from("text_shortcuts").delete().eq("id", id);
  if (error) throw new Error("Could not delete the shortcut");
  revalidateSection("/admin/shortcuts");
}

/**
 * Enabled shortcuts for the chat composer — usable by EVERY staff member.
 * Fails soft to an empty list (e.g. before migration 0012 is run) so the
 * chat itself never breaks.
 */
export async function getShortcutsForChat(
  adminId: string,
): Promise<Array<{ key: string; expansion: string }>> {
  await requireAdmin(adminId);
  try {
    const { data, error } = await svc()
      .from("text_shortcuts")
      .select("key, expansion")
      .eq("is_enabled", true)
      .order("key", { ascending: true });
    if (error) return [];
    return (data ?? []) as Array<{ key: string; expansion: string }>;
  } catch {
    return [];
  }
}

/* ── Offers ticker (migration 0026) ──────────────────────────────────────
 * Admin-managed offer lines every player sees: desktop right rail
 * (bottom-to-top) + mobile top bar (right-to-left). Mutations return
 * results (never throw) so the manager form shows the real message —
 * thrown action errors surface in production as a minified React
 * digest instead (see the #441 fix). Reads fail soft pre-migration. */

export interface OfferRow {
  id: string;
  text: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

type OfferResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const offerSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Write the offer text")
    .max(120, "Keep the offer under 120 characters so it fits the ticker"),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

const MIGRATION_0026_MSG =
  "Offers need migration 0026 — please run it in the SQL Editor first.";

function isMissingOffersTable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /offers|offer_settings/.test(msg);
}

/** All offers (active + paused) for the manager, in display order. */
export async function listOffers(
  adminId: string,
): Promise<{ offers: OfferRow[]; needsMigration: boolean }> {
  await requireAdmin(adminId);
  try {
    const { data, error } = await svc()
      .from("offers")
      .select("id, text, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      return { offers: [], needsMigration: isMissingOffersTable(error) };
    }
    return { offers: (data ?? []) as OfferRow[], needsMigration: false };
  } catch {
    return { offers: [], needsMigration: true };
  }
}

export async function createOffer(
  adminId: string,
  input: { text: string; sortOrder?: number; isActive?: boolean },
): Promise<OfferResult> {
  await requireAdmin(adminId);
  const parsed = offerSchema.safeParse({
    text: input.text,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid offer" };
  }
  const { data, error } = await svc()
    .from("offers")
    .insert({
      text: parsed.data.text,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error: isMissingOffersTable(error)
        ? MIGRATION_0026_MSG
        : "Could not save the offer",
    };
  }
  await audit(adminId, "offers.create", data?.id);
  revalidateSection("/admin/offers");
  return { ok: true, id: data?.id };
}

export async function updateOffer(
  adminId: string,
  id: string,
  input: { text: string; sortOrder?: number; isActive?: boolean },
): Promise<OfferResult> {
  await requireAdmin(adminId);
  const parsed = offerSchema.safeParse({
    text: input.text,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid offer" };
  }
  const { error } = await svc()
    .from("offers")
    .update({
      text: parsed.data.text,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: isMissingOffersTable(error)
        ? MIGRATION_0026_MSG
        : "Could not save the offer",
    };
  }
  await audit(adminId, "offers.update", id);
  revalidateSection("/admin/offers");
  return { ok: true, id };
}

export async function deleteOffer(
  adminId: string,
  id: string,
): Promise<OfferResult> {
  await requireAdmin(adminId);
  const { error } = await svc().from("offers").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      error: isMissingOffersTable(error)
        ? MIGRATION_0026_MSG
        : "Could not delete the offer",
    };
  }
  await audit(adminId, "offers.delete", id);
  revalidateSection("/admin/offers");
  return { ok: true };
}

/** Global ticker switch (single row, id = 1). Missing row = enabled,
 *  so the ticker works right after the migration, before anyone
 *  touches the switch. */
export async function getTickerEnabled(adminId: string): Promise<boolean> {
  await requireAdmin(adminId);
  try {
    const { data, error } = await svc()
      .from("offer_settings")
      .select("ticker_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return true;
    return (data as { ticker_enabled: boolean }).ticker_enabled;
  } catch {
    return true;
  }
}

export async function setTickerEnabled(
  adminId: string,
  enabled: boolean,
): Promise<OfferResult> {
  await requireAdmin(adminId);
  const { error } = await svc()
    .from("offer_settings")
    .upsert(
      { id: 1, ticker_enabled: enabled, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) {
    return {
      ok: false,
      error: isMissingOffersTable(error)
        ? MIGRATION_0026_MSG
        : "Could not change the ticker switch",
    };
  }
  await audit(adminId, "offers.ticker_toggle", enabled ? "on" : "off");
  revalidateSection("/admin/offers");
  return { ok: true };
}
