"use client";

import { useState } from "react";

import type { AdminInfo, PlayerDetailView } from "../../_actions";
import {
  addPlayerNote,
  addPlayerTag,
  approveDeposit,
  createGameAccountForPlayer,
  decryptAccountPassword,
  deleteGameAccount,
  deletePlayerNote,
  editGameAccount,
  getGames,
  markAccountActive,
  rejectDeposit,
  removePlayerTag,
} from "../../_actions";
import { cn, normalizeTag } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import ScreenshotViewer from "./screenshot-viewer";
import { StatusChip, TagChip, fullDateTime, timeAgo } from "./ui-bits";

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [approving, setApproving] = useState(false);
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
    onBusy(true);
    try {
      await editGameAccount(admin.id, {
        accountId: account.id,
        username: username.trim(),
        password: newPassword ? newPassword : undefined,
      });
      setEditing(false);
      setNewPassword("");
      if (onMutated) await onMutated();
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
        <button
          type="button"
          onClick={approve}
          disabled={approving}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[13px] font-bold text-[#03231a] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
        >
          <CheckIcon className="h-4 w-4" />
          {approving ? "Approving…" : "Approve — Mark as Active"}
        </button>
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
            </>
          ) : (
            <div className="space-y-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-sm text-text-primary"
              />
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (optional)"
                type="password"
                className="w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-sm text-text-primary"
              />
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
                  }}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main details panel ── */

export default function DetailsPanel({
  admin,
  detail,
  games,
  onMutated,
}: {
  admin: AdminInfo;
  detail: PlayerDetailView;
  games: Array<{ id: string; name: string }>;
  onMutated?: () => Promise<void>;
}) {
  const [newTag, setNewTag] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; caption: string } | null>(null);
  const [selectedGame, setSelectedGame] = useState(games[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      if (onMutated) await onMutated();
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-navy p-3.5">
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
      </div>

      {/* Wallet */}
      <div>
        <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Wallet
        </p>
        <div className="space-y-2 rounded-xl border border-surface-border bg-surface-card px-3.5 py-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-text-muted">Balance</span>
            <span className="font-bold text-text-primary">$0.00</span>
          </div>
          <div className="flex justify-between border-t border-surface-border pt-2">
            <span className="text-text-muted">Status</span>
            <span className="font-semibold text-text-primary">
              {detail.player.isOnline ? "Active now" : "Offline"}
            </span>
          </div>
          <div className="flex justify-between border-t border-surface-border pt-2">
            <span className="text-text-muted">Game accounts</span>
            <span className="font-bold text-text-primary">{detail.accounts.length}</span>
          </div>
        </div>
      </div>

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
                onClick={() => run(() => removePlayerTag(admin.id, { playerId: detail.player.id, tag }))}
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
              onClick={() => run(() => addPlayerTag(admin.id, { playerId: detail.player.id, tag: p }))}
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
                run(async () => {
                  await addPlayerTag(admin.id, { playerId: detail.player.id, tag: newTag.trim() });
                  setNewTag("");
                });
              }
            }}
            placeholder="Custom tag..."
            className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            disabled={busy || !newTag.trim()}
            onClick={() =>
              run(async () => {
                await addPlayerTag(admin.id, { playerId: detail.player.id, tag: newTag.trim() });
                setNewTag("");
              })
            }
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
          {detail.accounts.map((a) => (
            <AccountCard key={a.id} admin={admin} account={a} onBusy={setBusy} onMutated={onMutated} />
          ))}
        </div>
      </Collapsible>

      {/* Create game account — minimized by default */}
      <Collapsible title="Create game account">
        <div className="flex gap-2">
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-input px-3 py-2.5 text-[14px] text-text-primary"
          >
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={creating || !selectedGame}
            onClick={async () => {
              setCreating(true);
              try {
                await createGameAccountForPlayer(admin.id, detail.player.id, selectedGame);
                if (onMutated) await onMutated();
              } finally {
                setCreating(false);
              }
            }}
            className="rounded-lg bg-gold px-5 py-2.5 text-[14px] font-bold text-navy hover:opacity-90 disabled:opacity-40"
          >
            {creating ? "…" : "Create"}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
          Generates the username &amp; password, adds it to the sheet log, and sends the login
          to the player as a card in this chat.
        </p>
      </Collapsible>

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
