"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminInfo, PlayerDetailView } from "../../_actions";
import {
  addPlayerNote,
  addPlayerTag,
  approveDeposit,
  decryptAccountPassword,
  deleteGameAccount,
  deletePlayerNote,
  editGameAccount,
  markAccountActive,
  rejectDeposit,
  removePlayerTag,
} from "../../_actions";
import { cn } from "@/lib/utils";
import { normalizeTag } from "@/lib/utils";
import {
  CheckIcon,
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
  "High roller",
  "New player",
  "Follow-up",
  "Bonus hunter",
  "At risk",
  "Paid",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-surface-border px-3.5 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

/* ── Password show/copy (R7: explicit action only) ─────────────────────── */

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
    <span className="flex items-center gap-1 font-mono text-text-primary">
      {revealed && password ? password : "••••••••"}
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
        className="admin-focus rounded p-0.5 text-text-muted hover:text-gold disabled:opacity-40"
      >
        {revealed ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
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
        className="admin-focus rounded p-0.5 text-text-muted hover:text-gold"
      >
        <CopyIcon className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/* ── Game account row ──────────────────────────────────────────────────── */

function AccountRow({
  admin,
  account,
  onBusy,
}: {
  admin: AdminInfo;
  account: PlayerDetailView["accounts"][number];
  onBusy: (b: boolean) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(account.username);
  const [newPassword, setNewPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activating, setActivating] = useState(false);

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
      router.refresh();
    } finally {
      onBusy(false);
    }
  }

  async function doDelete() {
    onBusy(true);
    try {
      await deleteGameAccount(admin.id, account.id);
      router.refresh();
    } finally {
      onBusy(false);
    }
  }

  async function activate() {
    setActivating(true);
    try {
      await markAccountActive(admin.id, account.id);
      router.refresh();
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="rounded-md border border-surface-border bg-surface-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-primary">{account.gameName}</span>
        <StatusChip status={account.status} />
      </div>
      {!editing ? (
        <div className="mt-1.5 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-muted">Username</span>
            <span className="font-mono text-text-primary">{account.username}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-muted">Password</span>
            <PasswordCell admin={admin} accountId={account.id} />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[10px] text-text-muted">
              Created {timeAgo(account.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setUsername(account.username);
                  setEditing(true);
                }}
                aria-label={`Edit ${account.gameName} account`}
                className="admin-focus rounded p-1 text-text-muted hover:text-gold"
              >
                <EditIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete) void doDelete();
                  else {
                    setConfirmDelete(true);
                    setTimeout(() => setConfirmDelete(false), 3000);
                  }
                }}
                aria-label={confirmDelete ? "Confirm delete" : `Delete ${account.gameName} account`}
                className={cn(
                  "admin-focus rounded px-1.5 py-1 text-[11px] font-medium",
                  confirmDelete
                    ? "bg-danger/15 text-danger"
                    : "text-text-muted hover:text-danger",
                )}
              >
                {confirmDelete ? "Confirm?" : <TrashIcon className="h-3.5 w-3.5" />}
              </button>
            </span>
          </div>
          {account.status === "creating" && (
            <button
              type="button"
              onClick={activate}
              disabled={activating}
              className="admin-focus mt-1.5 w-full rounded-md bg-gold px-2 py-1.5 text-xs font-semibold text-navy transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {activating ? "Activating…" : "Mark as active"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-label="Username"
            className="admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2 py-1.5 font-mono text-xs text-text-primary"
          />
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (optional)"
            aria-label="New password"
            className="admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveEdit}
              className="admin-focus flex-1 rounded-md bg-gold px-2 py-1.5 text-xs font-semibold text-navy hover:opacity-90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="admin-focus flex-1 rounded-md border border-surface-border px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Pending deposit row ───────────────────────────────────────────────── */

function DepositRow({
  admin,
  deposit,
  onView,
}: {
  admin: AdminInfo;
  deposit: PlayerDetailView["pendingDeposits"][number];
  onView: (src: string, caption: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  async function approve() {
    setBusy(true);
    try {
      await approveDeposit(admin.id, deposit.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await rejectDeposit(admin.id, { depositId: deposit.id, note: note.trim() });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-gold/30 bg-surface-card p-2.5">
      <div className="flex gap-2.5">
        {deposit.screenshotUrl ? (
          <button
            type="button"
            onClick={() => onView(deposit.screenshotUrl!, `$${deposit.amount} · ${deposit.methodName}`)}
            className="admin-focus shrink-0 overflow-hidden rounded border border-surface-border"
            aria-label="Open screenshot full screen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={deposit.screenshotUrl}
              alt="Deposit screenshot"
              className="h-16 w-16 object-cover"
            />
          </button>
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-surface-border text-[10px] text-text-muted">
            No shot
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">${deposit.amount}</p>
          <p className="truncate text-[11px] text-text-secondary">{deposit.methodName}</p>
          <p className="text-[10px] text-text-muted" title={fullDateTime(deposit.createdAt)}>
            {timeAgo(deposit.createdAt)} ago
          </p>
        </div>
      </div>
      {!rejecting ? (
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="admin-focus flex-1 rounded-md bg-success px-2 py-1.5 text-xs font-semibold text-navy transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="admin-focus flex-1 rounded-md bg-danger/15 px-2 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/25 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Rejection reason (optional)"
            aria-label="Rejection reason"
            className="admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={reject}
              disabled={busy}
              className="admin-focus flex-1 rounded-md bg-danger px-2 py-1.5 text-xs font-semibold text-navy disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setNote("");
              }}
              className="admin-focus flex-1 rounded-md border border-surface-border px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Details panel ─────────────────────────────────────────────────────── */

export default function DetailsPanel({
  admin,
  detail,
}: {
  admin: AdminInfo;
  detail: PlayerDetailView;
}) {
  const router = useRouter();
  const [newTag, setNewTag] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; caption: string } | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const addCustomTag = () =>
    run(async () => {
      const t = normalizeTag(newTag);
      if (!t) return;
      await addPlayerTag(admin.id, { playerId: detail.player.id, tag: t });
      setNewTag("");
    });

  const addNote = () =>
    run(async () => {
      const body = noteBody.trim();
      if (!body) return;
      await addPlayerNote(admin.id, { playerId: detail.player.id, body });
      setNoteBody("");
    });

  const actionNeeded =
    detail.pendingDeposits.length > 0 ||
    detail.accounts.some((a) => a.status === "creating");

  return (
    <div className="admin-thin-scroll h-full overflow-y-auto bg-navy">
      {/* Player header */}
      <div className="border-b border-surface-border px-3.5 py-3">
        <p className="text-sm font-semibold text-text-primary">
          {detail.player.displayName}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-text-muted">
          {detail.player.email ?? "No email"}
        </p>
      </div>

      {/* Needs your action */}
      {actionNeeded && (
        <Section title="Needs your action">
          <div className="space-y-2">
            {detail.pendingDeposits.map((d) => (
              <DepositRow
                key={d.id}
                admin={admin}
                deposit={d}
                onView={(src, caption) => setViewer({ src, caption })}
              />
            ))}
            {detail.accounts
              .filter((a) => a.status === "creating")
              .map((a) => (
                <p key={a.id} className="rounded-md bg-gold/10 px-2.5 py-2 text-[11px] text-gold">
                  {a.gameName} account waiting — use “Mark as active” below.
                </p>
              ))}
          </div>
        </Section>
      )}

      {/* Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap gap-1.5">
          {detail.tags.length === 0 && (
            <span className="text-[11px] text-text-muted">No tags yet</span>
          )}
          {detail.tags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              onRemove={() =>
                run(() =>
                  removePlayerTag(admin.id, { playerId: detail.player.id, tag }),
                )
              }
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TAG_PRESETS.filter(
            (p) => !detail.tags.includes(normalizeTag(p)),
          ).map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => addPlayerTag(admin.id, { playerId: detail.player.id, tag: p }))
              }
              className="admin-focus rounded-full border border-dashed border-surface-border px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-40"
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
              if (e.key === "Enter") addCustomTag();
            }}
            placeholder="Custom tag…"
            aria-label="Custom tag"
            className="admin-focus min-w-0 flex-1 rounded-md border border-surface-border bg-surface-input px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={addCustomTag}
            disabled={busy || !newTag.trim()}
            aria-label="Add tag"
            className="admin-focus rounded-md bg-surface-elevated p-1.5 text-text-secondary hover:text-gold disabled:opacity-40"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </Section>

      {/* Private notes */}
      <Section title="Private notes">
        <div className="space-y-1.5">
          {detail.notes.length === 0 && (
            <span className="text-[11px] text-text-muted">
              No notes. Notes are admin-only — never shown to the player.
            </span>
          )}
          {detail.notes.map((n) => (
            <div
              key={n.id}
              className="rounded-md border border-surface-border bg-surface-card p-2"
            >
              <p className="whitespace-pre-wrap text-xs text-text-primary">{n.body}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-text-muted">
                  {n.createdBy} · {timeAgo(n.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => run(() => deletePlayerNote(admin.id, n.id))}
                  disabled={busy}
                  aria-label="Delete note"
                  className="admin-focus rounded p-1 text-text-muted hover:text-danger disabled:opacity-40"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addNote();
            }}
            placeholder="Add a private note…"
            aria-label="Add a private note"
            className="admin-focus min-w-0 flex-1 rounded-md border border-surface-border bg-surface-input px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={busy || !noteBody.trim()}
            aria-label="Add note"
            className="admin-focus rounded-md bg-gold p-1.5 text-navy hover:opacity-90 disabled:opacity-40"
          >
            <CheckIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </Section>

      {/* Game accounts */}
      <Section title={`Game accounts (${detail.accounts.length})`}>
        <div className="space-y-2">
          {detail.accounts.length === 0 && (
            <span className="text-[11px] text-text-muted">No accounts yet</span>
          )}
          {detail.accounts.map((a) => (
            <AccountRow key={a.id} admin={admin} account={a} onBusy={setBusy} />
          ))}
        </div>
      </Section>

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
