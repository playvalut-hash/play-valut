"use client";

import { useState } from "react";

import type {
  AdminAccountView,
  AdminInfo,
  ChatMessageView,
  PendingDepositView,
  PlayerDetailView,
} from "../../_actions";
import {
  addPlayerNote,
  addPlayerTag,
  approveDeposit,
  createGameAccountForPlayer,
  decryptAccountPassword,
  deleteGameAccount,
  deletePlayerNote,
  editGameAccount,
  markAccountActive,
  clearPlayerChat,
  deletePlayer,
  rejectDeposit,
  resendGameAccountCard,
  resetPlayerPassword,
  removePlayerTag,
  setPlayerBlocked,
} from "../../_actions";
import { cn, normalizeTag } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import ScreenshotViewer from "./screenshot-viewer";
import {
  ApproveButton,
  StatusChip,
  fullDateTime,
  timeAgo,
} from "./ui-bits";

const TAG_PRESETS = [
  "VIP",
  "Paid",
  "High roller",
  "Follow-up",
  "Bonus hunter",
  "At risk",
  "New player",
];

/* ── Collapsible section (matches reference screenshots) ──
   Default: minimized. When `attention` is true (e.g. a new account
   request is waiting), the section auto-expands and gets a gold ring. */

function Collapsible({
  title,
  count,
  defaultOpen = false,
  attention = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  attention?: boolean;
  children: React.ReactNode;
}) {
  // null = user ne abhi toggle nahi kiya → default/attention decide karega.
  // Ek dafa toggle karne ke baad user ki choice hi chalegi.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (defaultOpen || attention);

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-card",
        attention ? "border-gold shadow-[0_0_0_1px_var(--color-gold)]" : "border-surface-border",
      )}
    >
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          {title}
          {attention && (
            <span className="rounded-full bg-gold px-1.5 py-px text-[9px] font-extrabold normal-case tracking-normal text-navy">
              Action needed
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {typeof count === "number" && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-elevated px-1.5 text-[11px] font-bold text-text-secondary">
              {count}
            </span>
          )}
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 text-text-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open && <div className="border-t border-surface-border px-3.5 py-3">{children}</div>}
    </div>
  );
}

/* ── Password show/copy ── */

function PasswordCell({ admin, accountId }: { admin: AdminInfo; accountId: string }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ensure(): Promise<string | null> {
    if (password) return password;
    setBusy(true);
    try {
      const pw = await decryptAccountPassword(admin.id, accountId);
      setPassword(pw);
      return pw;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-1.5 font-mono text-[13px] text-text-primary">
      <span className="text-text-muted">Pass:</span>
      {revealed && password ? (
        <span className="select-all">{password}</span>
      ) : (
        <span>••••••••</span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (revealed) {
            setRevealed(false);
            return;
          }
          const pw = await ensure();
          if (pw) setRevealed(true);
        }}
        aria-label={revealed ? "Hide password" : "Show password"}
        className="rounded p-0.5 text-text-muted hover:text-gold disabled:opacity-40"
      >
        {revealed ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={async () => {
          const pw = await ensure();
          if (pw) {
            try {
              await navigator.clipboard.writeText(pw);
            } catch {
              // clipboard unavailable
            }
          }
        }}
        aria-label="Copy password"
        className="rounded p-0.5 text-text-muted hover:text-gold"
      >
        <CopyIcon className="h-4 w-4" />
      </button>
    </span>
  );
}

/* ── Game account card (matches screenshot) ── */

function AccountCard({
  admin,
  account,
  onBusy,
  onMutated,
}: {
  admin: AdminInfo;
  account: PlayerDetailView["accounts"][number];
  onBusy: (b: boolean) => void;
  onMutated?: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(account.status === "creating");
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(account.username);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [approving, setApproving] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  // Optimistic status: flips to "active" the moment Approve is tapped.
  const [optimisticActive, setOptimisticActive] = useState(false);
  const displayStatus = optimisticActive ? "active" : account.status;

  async function approve() {
    if (approving) return;
    setApproving(true);
    setOptimisticActive(true); // instant visual feedback
    onBusy(true);
    try {
      await markAccountActive(admin.id, account.id);
      if (onMutated) await onMutated();
    } catch {
      setOptimisticActive(false);
    } finally {
      setApproving(false);
      onBusy(false);
    }
  }

  async function saveEdit() {
    if (!username.trim()) return;
    setEditError(null);
    onBusy(true);
    try {
      await editGameAccount(admin.id, {
        accountId: account.id,
        username: username.trim(),
        password: newPassword ? newPassword : undefined,
      });
      setEditing(false);
      setNewPassword("");
      setShowNewPassword(false);
      if (onMutated) await onMutated();
    } catch (err) {
      // A failed edit used to fail SILENTLY (no catch, no error line):
      // the form just sat there and the admin thought nothing happened.
      setEditError(
        err instanceof Error ? err.message : "Could not save changes",
      );
    } finally {
      onBusy(false);
    }
  }

  async function doDelete() {
    onBusy(true);
    try {
      await deleteGameAccount(admin.id, account.id);
      if (onMutated) await onMutated();
    } finally {
      onBusy(false);
    }
  }

  async function doResend() {
    if (resending) return;
    setResending(true);
    setResendNotice(null);
    setResendError(null);
    onBusy(true);
    try {
      const res = await resendGameAccountCard(admin.id, account.id);
      if (res.ok) {
        setResendNotice("Account card sent.");
        if (onMutated) await onMutated();
      } else {
        setResendError(res.error ?? "Could not send account card");
      }
    } finally {
      setResending(false);
      onBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-surface-border bg-navy p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-text-primary">{account.gameName}</span>
          <StatusChip status={displayStatus} />
        </span>
        <ChevronDownIcon
          className={cn("h-4 w-4 text-text-muted transition-transform", expanded && "rotate-180")}
        />
      </button>
      {displayStatus === "creating" && (
        <ApproveButton
          approving={approving}
          onApprove={approve}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[13px] font-bold text-[#03231a] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
        />
      )}
      {expanded && (
        <div className="mt-2.5 space-y-1.5 border-t border-surface-border pt-2.5">
          {!editing ? (
            <>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-text-muted">User:</span>
                <span className="font-mono text-text-primary">{account.username}</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(account.username);
                    } catch {
                      // noop
                    }
                  }}
                  className="rounded p-0.5 text-text-muted hover:text-gold"
                  aria-label="Copy username"
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <PasswordCell admin={admin} accountId={account.id} />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-gold/50 hover:text-gold"
                >
                  Edit
                </button>
                {displayStatus === "active" && (
                  <button
                    type="button"
                    onClick={doResend}
                    disabled={resending}
                    className="rounded-lg border border-gold/50 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/10 disabled:opacity-40"
                  >
                    {resending ? "Sending…" : "Resend"}
                  </button>
                )}
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-lg border border-danger/50 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                  >
                    Delete
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={doDelete}
                      className="rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-text-muted"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              {resendNotice && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12px] leading-relaxed text-emerald-300">
                  {resendNotice}
                </p>
              )}
              {resendError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] leading-relaxed text-red-300"
                >
                  {resendError}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-sm text-text-primary"
              />
              <div className="flex gap-2">
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (optional)"
                  type={showNewPassword ? "text" : "password"}
                  className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-sm text-text-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  className="rounded-lg border border-surface-border px-2.5 text-text-muted hover:border-gold/50 hover:text-gold"
                >
                  {showNewPassword ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-text-muted">
                Minimum 6 characters. Leave blank to keep the current
                password. Use the eye to check it before entering it in
                the game.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-navy"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setUsername(account.username);
                    setNewPassword("");
                    setShowNewPassword(false);
                    setEditError(null);
                  }}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-text-muted"
                >
                  Cancel
                </button>
              </div>
              {editError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] leading-relaxed text-red-300"
                >
                  {editError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main details panel ── */

/* ── Pending deposit card: screenshot + Verify / Reject (Build 45) ── */
function PendingDepositCard({
  admin,
  deposit,
  playerName,
  busy,
  run,
  onView,
}: {
  admin: AdminInfo;
  deposit: PendingDepositView;
  playerName: string;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onView: (src: string, caption: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="rounded-xl border border-gold/40 bg-surface-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-extrabold text-text-primary">
            ${deposit.amount}
            <span className="ml-1.5 text-[12px] font-semibold text-text-muted">
              via {deposit.methodName}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {timeAgo(deposit.createdAt)} · waiting for verification
          </p>
        </div>
        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
          PENDING
        </span>
      </div>

      {deposit.screenshotUrl && (
        <button
          type="button"
          onClick={() =>
            onView(deposit.screenshotUrl!, `${playerName} · $${deposit.amount} via ${deposit.methodName}`)
          }
          className="mt-2.5 block w-full overflow-hidden rounded-lg border border-surface-border"
          aria-label="Open payment screenshot full screen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={deposit.screenshotUrl}
            alt="Payment screenshot"
            className="max-h-44 w-full object-cover"
          />
        </button>
      )}

      {!rejecting ? (
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => approveDeposit(admin.id, deposit.id))}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            ✓ Verify
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="flex-1 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-[13px] font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-40"
          >
            ✗ Reject
          </button>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (optional) — sent to the player"
            className="w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(false)}
              className="flex-1 rounded-lg border border-surface-border px-3 py-2.5 text-[13px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() =>
                  rejectDeposit(admin.id, {
                    depositId: deposit.id,
                    note: note.trim(),
                  }),
                )
              }
              className="flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              Confirm reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DetailsPanel({
  admin,
  detail,
  games,
  onMutated,
  onAppendOptimistic,
  onDropOptimistic,
  onClearOptimistic,
  onDetailPatch,
}: {
  admin: AdminInfo;
  detail: PlayerDetailView;
  games: Array<{ id: string; name: string }>;
  onMutated?: () => Promise<void>;
  /** Optimistic UI (same contract as the thread): instant local feedback,
   *  reverted on failure, overwritten by server truth on refresh. */
  onAppendOptimistic?: (msg: ChatMessageView) => void;
  onDropOptimistic?: (id: string) => void;
  /** Instant thread blank on clear confirm; the server delete runs after. */
  onClearOptimistic?: (playerId: string, olderThanDays?: number) => void;
  onDetailPatch?: (
    playerId: string,
    patch: { tags?: string[]; accounts?: AdminAccountView[] },
  ) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; caption: string } | null>(null);
  const [pending, setPending] = useState<null | "block" | "clear" | "delete">(null);
  const [clearMode, setClearMode] = useState<"all" | "5" | "10" | "custom">("all");
  const [clearError, setClearError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetShow, setResetShow] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState("");
  const [selectedGame, setSelectedGame] = useState(games[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Only games the player does NOT already have can be created (Build 62).
  const creatableGames = games.filter(
    (g) => !detail.accounts.some((a) => a.gameId === g.id),
  );
  const effectiveGame = creatableGames.some((g) => g.id === selectedGame)
    ? selectedGame
    : (creatableGames[0]?.id ?? "");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      if (onMutated) await onMutated();
    } finally {
      setBusy(false);
    }
  }

  async function doResetPassword() {
    if (resetPassword.length < 6) {
      setResetError("Password must be at least 6 characters");
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError("Passwords do not match");
      return;
    }
    setBusy(true);
    setResetError(null);
    setResetNotice(null);
    try {
      const res = await resetPlayerPassword(
        admin.id,
        detail.player.id,
        resetPassword,
      );
      if (res.ok) {
        setResetNotice("Password updated.");
        setResetPassword("");
        setResetConfirm("");
      } else {
        setResetError(res.error ?? "Could not update password");
      }
    } finally {
      setBusy(false);
    }
  }

  // Optimistic tags: the chip appears instantly; the refresh overwrites
  // with server truth (same tags on success). On failure the snapshot
  // goes back. Returns false on failure so callers can restore input.
  async function runTag(fn: () => Promise<void>, nextTags: string[]): Promise<boolean> {
    const prevTags = detail.tags;
    onDetailPatch?.(detail.player.id, { tags: nextTags });
    setBusy(true);
    try {
      await fn();
      if (onMutated) await onMutated();
      return true;
    } catch {
      onDetailPatch?.(detail.player.id, { tags: prevTags });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const initials = (detail.player.displayName || "P")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-navy p-4">
      {/* Player header */}
      <div className="flex flex-col items-center pt-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 to-orange-800 text-lg font-extrabold text-white">
          {initials}
        </span>
        <p className="mt-2 text-[16px] font-bold text-text-primary">
          {detail.player.displayName}
        </p>
        <p className="text-[12px] text-text-muted">
          @{detail.player.displayName.toLowerCase().replace(/\s+/g, "")} ·{" "}
          {detail.tags.includes("vip") ? "Gold VIP" : detail.tags.includes("new player") ? "Silver VIP" : "Player"}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold">
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${detail.player.isOnline ? "bg-emerald-400" : "bg-zinc-500"}`}
          />
          <span className={detail.player.isOnline ? "text-emerald-400" : "text-text-muted"}>
            {detail.player.isOnline ? "Active now" : "Offline"}
          </span>
        </p>
        {detail.player.isBlocked && (
          <span className="mt-1.5 rounded-full border border-red-500/50 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold text-red-400">
            BLOCKED
          </span>
        )}
        {detail.guestDevice && (
          <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-text-secondary">
            {detail.guestDevice.visitCount > 1 ? (
              <>
                Returning guest — this device visited{" "}
                {detail.guestDevice.visitCount} times, first seen{" "}
                {new Date(
                  detail.guestDevice.firstSeenAt,
                ).toLocaleDateString()}
              </>
            ) : (
              <>
                Guest — first seen{" "}
                {new Date(
                  detail.guestDevice.firstSeenAt,
                ).toLocaleDateString()}
              </>
            )}
          </p>
        )}
      </div>

      {/* Pending deposits — action needed (Build 45) */}
      {detail.pendingDeposits.length > 0 && (
        <Collapsible
          title="Pending deposits"
          count={detail.pendingDeposits.length}
          attention
          defaultOpen
        >
          <div className="space-y-2">
            {detail.pendingDeposits.map((d) => (
              <PendingDepositCard
                key={d.id}
                admin={admin}
                deposit={d}
                playerName={detail.player.displayName}
                busy={busy}
                run={run}
                onView={(src, caption) => setViewer({ src, caption })}
              />
            ))}
          </div>
        </Collapsible>
      )}

      {/* Tags — minimized by default */}
      <Collapsible title="Tags">
        <div className="flex flex-wrap gap-1.5">
          {detail.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full border border-blue-500/50 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              {tag}
              <button
                type="button"
                onClick={() =>
                  void runTag(
                    () => removePlayerTag(admin.id, { playerId: detail.player.id, tag }),
                    detail.tags.filter((t) => t !== tag),
                  )
                }
                className="ml-0.5 hover:text-blue-200"
                aria-label={`Remove ${tag}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TAG_PRESETS.filter((p) => !detail.tags.includes(normalizeTag(p))).map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() =>
                void runTag(
                  () => addPlayerTag(admin.id, { playerId: detail.player.id, tag: p }),
                  [...detail.tags, normalizeTag(p)],
                )
              }
              className="rounded-full border border-dashed border-surface-border px-2.5 py-1 text-[11px] text-text-muted hover:border-gold/50 hover:text-gold disabled:opacity-40"
            >
              + {p}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTag.trim()) {
                const tag = newTag.trim();
                setNewTag("");
                void runTag(
                  () => addPlayerTag(admin.id, { playerId: detail.player.id, tag }),
                  [...detail.tags, normalizeTag(tag)],
                ).then((ok) => {
                  if (!ok) setNewTag(tag);
                });
              }
            }}
            placeholder="Custom tag..."
            className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            disabled={busy || !newTag.trim()}
            onClick={() => {
              const tag = newTag.trim();
              setNewTag("");
              void runTag(
                () => addPlayerTag(admin.id, { playerId: detail.player.id, tag }),
                [...detail.tags, normalizeTag(tag)],
              ).then((ok) => {
                if (!ok) setNewTag(tag);
              });
            }}
            className="rounded-lg bg-surface-elevated px-4 py-2 text-[13px] font-semibold text-text-primary hover:text-gold disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </Collapsible>

      {/* Notes */}
      <Collapsible title="Notes" count={detail.notes.length}>
        <div className="space-y-2">
          {detail.notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-surface-border bg-navy p-2.5">
              <p className="whitespace-pre-wrap text-[13px] text-text-primary">{n.body}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-text-muted">
                  {n.createdBy} · {timeAgo(n.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => run(() => deletePlayerNote(admin.id, n.id))}
                  className="rounded p-1 text-text-muted hover:text-danger"
                  aria-label="Delete note"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-1.5">
            <input
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && noteBody.trim()) {
                  run(async () => {
                    await addPlayerNote(admin.id, { playerId: detail.player.id, body: noteBody.trim() });
                    setNoteBody("");
                  });
                }
              }}
              placeholder="Add a note..."
              className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
            />
            <button
              type="button"
              disabled={busy || !noteBody.trim()}
              onClick={() =>
                run(async () => {
                  await addPlayerNote(admin.id, { playerId: detail.player.id, body: noteBody.trim() });
                  setNoteBody("");
                })
              }
              className="rounded-lg bg-gold px-3 py-2 text-navy hover:opacity-90 disabled:opacity-40"
              aria-label="Add note"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Collapsible>

      {/* Game accounts — minimized by default; auto-expands when a new
          account request (status "creating") is waiting for approval. */}
      <Collapsible
        title="Game accounts"
        count={detail.accounts.length}
        attention={detail.accounts.some((a) => a.status === "creating")}
      >
        <div className="space-y-2">
          {detail.accounts.length === 0 && (
            <p className="text-[12px] text-text-muted">No accounts yet</p>
          )}
          {/* Optimistic placeholder rows render as a plain pending row,
              never as an AccountCard (their Approve action would hit a
              row that does not exist yet). The refresh replaces them
              with the real creating rows. */}
          {detail.accounts
            .filter((a) => !a.id.startsWith("optimistic-"))
            .map((a) => (
              <AccountCard key={a.id} admin={admin} account={a} onBusy={setBusy} onMutated={onMutated} />
            ))}
          {detail.accounts
            .filter((a) => a.id.startsWith("optimistic-"))
            .map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-dashed border-gold/40 bg-gold/5 px-3 py-2.5"
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                <span className="text-[13px] text-text-secondary">
                  Creating {a.gameName} account…
                </span>
              </div>
            ))}
        </div>
      </Collapsible>

      {/* Create game account — minimized by default */}
      <Collapsible title="Create game account">
        {creatableGames.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-text-muted">
            This player already has an account for every game.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <select
                value={effectiveGame}
                onChange={(e) => setSelectedGame(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-input px-3 py-2.5 text-[14px] text-text-primary"
              >
                {/* Every active game shows here (DB-driven, so a newly
                    added active game appears automatically). Games the
                    player already has are disabled + labelled instead of
                    hidden — hiding them made the list look incomplete,
                    and the browser's own dropdown scrolls when the list
                    is taller than the screen. */}
                {games.map((g) => {
                  const owned = detail.accounts.some(
                    (a) => a.gameId === g.id,
                  );
                  return (
                    <option key={g.id} value={g.id} disabled={owned}>
                      {owned ? `${g.name} — already has account` : g.name}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                disabled={creating || !effectiveGame}
                onClick={async () => {
                  const gameId = effectiveGame;
                  const game = games.find((g) => g.id === gameId);
                  if (!game) return;
                  // Optimistic: the setup note echoes in the thread and a
                  // "Creating…" row appears in the panel INSTANTLY; the
                  // refresh replaces both with server truth. On failure
                  // both revert and the error shows.
                  const noteEcho: ChatMessageView = {
                    id: `echo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    playerId: detail.player.id,
                    sender: "system",
                    kind: "text",
                    createdAt: new Date().toISOString(),
                    text: `Setting up your ${game.name} account — give me just a sec 👍`,
                    account: null,
                    listTitle: null,
                    picked: null,
                    pickedName: null,
                    paymentCard: null,
                    screenshotUrl: null,
                    screenshotCaption: null,
                    readByPlayer: false,
                    readByAdmin: true,
                  };
                  const prevAccounts = detail.accounts;
                  const placeholder: AdminAccountView = {
                    id: `optimistic-${gameId}`,
                    gameId,
                    gameName: game.name,
                    username: "Creating…",
                    status: "creating",
                    createdAt: new Date().toISOString(),
                    activatedAt: null,
                  };
                  onAppendOptimistic?.(noteEcho);
                  onDetailPatch?.(detail.player.id, {
                    accounts: [...prevAccounts, placeholder],
                  });
                  setCreating(true);
                  setCreateError(null);
                  try {
                    await createGameAccountForPlayer(admin.id, detail.player.id, gameId);
                    if (onMutated) await onMutated();
                  } catch (e) {
                    onDropOptimistic?.(noteEcho.id);
                    onDetailPatch?.(detail.player.id, { accounts: prevAccounts });
                    setCreateError(
                      e instanceof Error ? e.message : "Could not create account",
                    );
                  } finally {
                    setCreating(false);
                  }
                }}
                className="rounded-lg bg-gold px-5 py-2.5 text-[14px] font-bold text-navy hover:opacity-90 disabled:opacity-40"
              >
                {creating ? "…" : "Create"}
              </button>
            </div>
            {createError && (
              <p role="alert" className="mt-2 text-[12px] font-medium text-red-400">
                {createError}
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
              Generates the username &amp; password and sends the login to the player as a
              card in this chat. Once the account is ready on the game, verify it from
              that card — the player then gets the “account ready” message.
            </p>
          </>
        )}
      </Collapsible>

      {/* Moderation — permission-gated (Build 43) */}
      {(admin.permissions.player_block ||
        admin.permissions.chat_clear ||
        admin.permissions.player_delete) && (
        <Collapsible title="Moderation" defaultOpen={detail.player.isBlocked}>
          <div className="space-y-2">
            {detail.player.isBlocked && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] leading-relaxed text-red-300">
                This player is blocked
                {detail.player.blockedAt
                  ? ` since ${fullDateTime(detail.player.blockedAt)}`
                  : ""}
                . They cannot use the app until unblocked.
              </p>
            )}
            {admin.permissions.player_block &&
              (detail.player.isBlocked ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setPlayerBlocked(admin.id, detail.player.id, false))}
                  className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2.5 text-[13px] font-bold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  Unblock player
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending("block")}
                  className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-[13px] font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-40"
                >
                  Block player
                </button>
              ))}
            {admin.permissions.chat_clear && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setClearMode("all");
                  setCustomDays("");
                  setClearError(null);
                  setPending("clear");
                }}
                className="w-full rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-[13px] font-bold text-amber-400 hover:bg-amber-500/20 disabled:opacity-40"
              >
                Clear chat history
              </button>
            )}
            {admin.permissions.player_delete && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending("delete")}
                className="w-full rounded-lg border border-red-600/60 bg-red-600/15 px-3 py-2.5 text-[13px] font-bold text-red-400 hover:bg-red-600/25 disabled:opacity-40"
              >
                Delete player (permanent)
              </button>
            )}
            {clearError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] leading-relaxed text-red-300">
                {clearError}
              </p>
            )}
            <p className="px-1 text-[11px] leading-relaxed text-text-muted">
              Clear chat removes messages only. Delete removes the player, their game
              accounts, deposits and chat — it cannot be undone.
            </p>
          </div>
        </Collapsible>
      )}

      {/* Password reset — super admin only. Guests have no password
          (email null), so the section hides for them. One account backs
          the player app and the admin app, so one reset fixes both. */}
      {admin.role === "super_admin" && detail.player.email !== null && (
        <Collapsible title="Password reset">
          <div className="space-y-2">
            <p className="px-1 text-[11px] leading-relaxed text-text-muted">
              Set a new sign-in password for this player. It takes effect
              immediately for both the player app and the admin app.
            </p>
            <input
              type={resetShow ? "text" : "password"}
              value={resetPassword}
              onChange={(e) => {
                setResetPassword(e.target.value);
                setResetError(null);
                setResetNotice(null);
              }}
              placeholder="New password (min 6 characters)"
              autoComplete="new-password"
              className="w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
            />
            <input
              type={resetShow ? "text" : "password"}
              value={resetConfirm}
              onChange={(e) => {
                setResetConfirm(e.target.value);
                setResetError(null);
                setResetNotice(null);
              }}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
            />
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setResetShow(!resetShow)}
                className="text-[12px] font-bold text-text-muted hover:text-text-primary"
              >
                {resetShow ? "Hide passwords" : "Show passwords"}
              </button>
            </div>
            <button
              type="button"
              disabled={
                busy ||
                resetPassword.length < 6 ||
                resetPassword !== resetConfirm
              }
              onClick={doResetPassword}
              className="w-full rounded-lg border border-gold/50 bg-gold/10 px-3 py-2.5 text-[13px] font-bold text-gold hover:bg-gold/20 disabled:opacity-40"
            >
              Reset password
            </button>
            {resetError && (
              <p
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] leading-relaxed text-red-300"
              >
                {resetError}
              </p>
            )}
            {resetNotice && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12px] leading-relaxed text-emerald-300">
                {resetNotice}
              </p>
            )}
          </div>
        </Collapsible>
      )}

      {/* Moderation confirmation popup (Build 44) */}
      {pending && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPending(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold text-text-primary">
              {pending === "block"
                ? "Block this player?"
                : pending === "clear"
                  ? "Clear chat history?"
                  : "Delete this player forever?"}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              {pending === "block"
                ? `${detail.player.displayName} will be locked out of the app until you unblock them.`
                : pending === "clear"
                  ? clearMode === "all"
                    ? `ALL messages with ${detail.player.displayName} will be permanently deleted from the database. Game accounts and deposits stay.`
                    : `Messages older than ${clearMode === "custom" ? customDays || "…" : clearMode} days will be permanently deleted from the database — the recent days stay. Game accounts and deposits stay.`
                  : `${detail.player.displayName}'s account, game logins, deposits and chat will be permanently deleted from the database. This cannot be undone.`}
            </p>
            {pending === "clear" && (
              <div className="mt-3 space-y-1.5" role="radiogroup" aria-label="How much chat to clear">
                {(
                  [
                    { key: "all", label: "Clear all — everything" },
                    { key: "5", label: "Older than 5 days (keep last 5 days)" },
                    { key: "10", label: "Older than 10 days (keep last 10 days)" },
                    { key: "custom", label: "Custom" },
                  ] as const
                ).map((opt) => (
                  <div
                    key={opt.key}
                    role="radio"
                    aria-checked={clearMode === opt.key}
                    onClick={() => setClearMode(opt.key)}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px] transition ${
                      clearMode === opt.key
                        ? "border-amber-500/70 bg-amber-500/10 font-semibold text-amber-300"
                        : "border-surface-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.key === "custom" && (
                      <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          value={customDays}
                          onChange={(e) => {
                            setCustomDays(e.target.value);
                            setClearMode("custom");
                          }}
                          onFocus={() => setClearMode("custom")}
                          placeholder="30"
                          aria-label="Custom days"
                          className="w-16 rounded-md border border-surface-border bg-surface-input px-2 py-1 text-[13px] text-text-primary"
                        />
                        <span className="text-[12px] text-text-muted">days</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 rounded-lg border border-surface-border px-3 py-2.5 text-[13px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  (pending === "clear" &&
                    clearMode === "custom" &&
                    (!Number.isFinite(Number.parseInt(customDays, 10)) ||
                      Number.parseInt(customDays, 10) < 1 ||
                      Number.parseInt(customDays, 10) > 3650))
                }
                onClick={async () => {
                  const action = pending;
                  setPending(null);
                  if (action === "block") {
                    await run(() => setPlayerBlocked(admin.id, detail.player.id, true));
                  } else if (action === "clear") {
                    const days =
                      clearMode === "all"
                        ? undefined
                        : clearMode === "custom"
                          ? Number.parseInt(customDays, 10)
                          : Number.parseInt(clearMode, 10);
                    // UI blanks INSTANTLY; the server delete (rows +
                    // storage objects) takes seconds to catch up.
                    onClearOptimistic?.(detail.player.id, days);
                    setClearError(null);
                    setBusy(true);
                    try {
                      await clearPlayerChat(admin.id, detail.player.id, days);
                      if (onMutated) await onMutated();
                    } catch {
                      // Rows are still in the DB — refetch restores them.
                      if (onMutated) await onMutated();
                      setClearError(
                        "Clear failed — the chat was not deleted. Please try again.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  } else {
                    await run(() => deletePlayer(admin.id, detail.player.id));
                  }
                }}
                className={
                  pending === "clear"
                    ? "flex-1 rounded-lg bg-amber-500 px-3 py-2.5 text-[13px] font-bold text-black hover:opacity-90 disabled:opacity-40"
                    : "flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                }
              >
                {pending === "block"
                  ? "Block player"
                  : pending === "clear"
                    ? clearMode === "all"
                      ? "Clear everything"
                      : `Clear older than ${clearMode === "custom" ? customDays || "…" : clearMode} days`
                    : "Delete player"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <ScreenshotViewer
          src={viewer.src}
          caption={viewer.caption}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
