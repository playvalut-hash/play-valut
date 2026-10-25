"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import type { AdminInfo, ChatMessageView, PlayerOverview } from "../../_actions";
import {
  decryptAccountPassword,
  markAccountActive,
  sendAdminMessage,
  adminSendChatImage,
  getShortcutsForChat,
  sendGamesList,
  sendPayList,
  sendQuickReply,
  sendSingleGame,
  sendSingleMethod,
  getThreadOlder,
} from "../../_actions";
import { QUICK_REPLIES } from "../../_quick-replies";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LinkIcon,
  SendIcon,
  ImageIcon,
} from "@/components/icons";
import { expandShortcut } from "@/lib/text-expander";
import ScreenshotViewer from "./screenshot-viewer";
import {
  ApproveButton,
  Avatar,
  StatusChip,
  bubbleTime,
  fullDateTime,
} from "./ui-bits";
import { safeHref } from "@/lib/urls";

/* ── Account card (fixed 400px, never stretches — PRD Change 21a) ──────── */

function AccountCard({
  admin,
  playerName,
  msg,
  onMutated,
}: {
  admin: AdminInfo;
  playerName: string;
  msg: ChatMessageView & { account: NonNullable<ChatMessageView["account"]> };
  onMutated?: () => Promise<void>;
}) {
  const { account } = msg;
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  // Optimistic status: flips to "active" the moment Approve is tapped.
  const [optimisticActive, setOptimisticActive] = useState(false);
  const status = optimisticActive ? "active" : account.status;

  async function approve() {
    if (approving) return;
    setApproving(true);
    setOptimisticActive(true); // instant visual feedback
    try {
      await markAccountActive(admin.id, account.accountId);
      if (onMutated) await onMutated();
    } catch {
      setOptimisticActive(false); // revert on failure
    } finally {
      setApproving(false);
    }
  }

  async function reveal() {
    if (password) {
      setRevealed((v) => !v);
      return;
    }
    setBusy(true);
    try {
      const pw = await decryptAccountPassword(admin.id, account.accountId);
      setPassword(pw);
      setRevealed(true);
    } catch {
      // leave masked
    } finally {
      setBusy(false);
    }
  }

  // Username copy is its own action (v2 Phase 3): the old username
  // button reused copy(), which writes the PASSWORD to the clipboard.
  async function copyUsername() {
    try {
      await navigator.clipboard.writeText(account.username);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  async function copy() {
    let pw = password;
    if (!pw) {
      setBusy(true);
      try {
        pw = await decryptAccountPassword(admin.id, account.accountId);
        setPassword(pw);
      } catch {
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    try {
      await navigator.clipboard.writeText(pw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="w-[400px] max-w-full rounded-2xl border border-gold/30 bg-surface-elevated p-3 shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gold">{account.gameName}</span>
        <StatusChip status={status} />
      </div>
      <dl className="mt-2 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-muted">Username</dt>
          <dd className="flex items-center gap-1.5 font-mono text-text-primary">
            {account.username}
            <button
              type="button"
              onClick={copyUsername}
              aria-label="Copy username"
              className="admin-focus rounded p-0.5 text-text-muted hover:text-gold"
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-success" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
            </button>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-muted">Password</dt>
          <dd className="flex items-center gap-1.5 font-mono text-text-primary">
            {revealed && password ? password : "••••••••"}
            <button
              type="button"
              onClick={reveal}
              disabled={busy}
              aria-label={revealed ? "Hide password" : "Show password"}
              className="admin-focus rounded p-0.5 text-text-muted hover:text-gold disabled:opacity-40"
            >
              {revealed ? (
                <EyeOffIcon className="h-3.5 w-3.5" />
              ) : (
                <EyeIcon className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy password"
              className="admin-focus rounded p-0.5 text-text-muted hover:text-gold"
            >
              <CopyIcon className="h-3.5 w-3.5" />
            </button>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] text-text-muted">
        For {playerName} · created {fullDateTime(msg.createdAt)}
      </p>
      {status === "creating" && (
        <ApproveButton
          approving={approving}
          onApprove={approve}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[13px] font-bold text-[#03231a] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
        />
      )}
    </div>
  );
}

/* ── Message bubble ────────────────────────────────────────────────────── */

function MessageItem({
  admin,
  playerName,
  msg,
  onViewShot,
  onMutated,
  receipt,
}: {
  admin: AdminInfo;
  playerName: string;
  msg: ChatMessageView;
  onViewShot: (src: string, caption: string | null) => void;
  onMutated?: () => Promise<void>;
  receipt?: "delivered" | "seen";
}) {
  if (msg.kind === "system") {
    return (
      <div className="admin-msg-in flex justify-center py-1">
        <span className="max-w-[80%] rounded-full border border-surface-border bg-surface-elevated px-3 py-1 text-center text-[11px] text-text-secondary">
          {msg.text}
        </span>
      </div>
    );
  }

  if (msg.kind === "account" && msg.account) {
    const mine = msg.sender !== "player"; // support side = admin-typed AND system auto messages (Build 58 separation fix)
    return (
      <div className={cn("admin-msg-in flex py-1", mine ? "justify-end" : "justify-start")}>
        <AccountCard
          admin={admin}
          playerName={playerName}
          msg={{ ...msg, account: msg.account }}
          onMutated={onMutated}
        />
      </div>
    );
  }

  // Deleted account (v2 Phase 2, audit M15): the card row is gone, so
  // render an explicit note instead of a silent gap in the thread.
  if (msg.kind === "account" && !msg.account) {
    return (
      <div className="admin-msg-in flex justify-center py-1">
        <span className="max-w-[80%] rounded-full border border-surface-border bg-surface-elevated px-3 py-1 text-center text-[11px] text-text-secondary">
          {msg.deletedGameName
            ? `${msg.deletedGameName} account was deleted.`
            : "This game account was deleted."}
        </span>
      </div>
    );
  }

  if (msg.kind === "games_list" || msg.kind === "pay_list") {
    return (
      <div className="admin-msg-in flex justify-end py-1">
        <div className="w-[400px] max-w-full rounded-2xl border border-surface-border bg-surface-card p-3.5">
          <p className="text-xs font-semibold text-text-primary">{msg.listTitle}</p>
          <p className="mt-1 text-[11px] text-text-secondary">
            {msg.picked
              ? `Player picked: ${msg.pickedName ?? msg.picked.id}`
              : "Waiting for the player to pick…"}
          </p>
        </div>
      </div>
    );
  }

  if (msg.kind === "payment_card" && msg.paymentCard) {
    const card = msg.paymentCard;
    return (
      <div className="admin-msg-in flex justify-end py-1">
        <div className="w-[400px] max-w-full overflow-hidden rounded-2xl border border-gold/30 bg-surface-card shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          {/* Header band — brand tile + label + Deposit tag */}
          <div
            className="flex items-center gap-2.5 px-3 py-2.5"
            style={{
              background: card.brandColor ?? "linear-gradient(135deg, #f0cd6a, #d4af37)",
              color: card.brandColor ? "#ffffff" : "#241a02",
            }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-base font-extrabold">
              {card.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-bold uppercase tracking-widest opacity-80">
                Payment method
              </span>
              <span className="block truncate text-[14px] font-extrabold leading-tight">
                {card.name}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
              Deposit
            </span>
          </div>
          {/* Body — labelled rows */}
          <div className="space-y-2 px-3 py-2.5">
            {card.accountName && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Name
                </span>
                <span className="text-right text-xs font-semibold text-text-primary">
                  {card.accountName}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Send to
              </span>
              <span className="flex items-center gap-1.5">
                <span className="rounded-md bg-surface-input px-2 py-1 font-mono text-xs font-bold text-gold">
                  {card.handle}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(card.handle);
                    } catch {
                      // noop
                    }
                  }}
                  aria-label="Copy payment handle"
                  className="admin-focus rounded p-1 text-text-muted hover:text-gold"
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
            {card.note && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Note
                </span>
                <span className="text-right text-xs text-text-secondary">{card.note}</span>
              </div>
            )}
            {safeHref(card.payLink) && (
              <a
                href={safeHref(card.payLink) ?? ""}
                target="_blank"
                rel="noreferrer"
                className="admin-focus inline-flex items-center gap-1 pt-0.5 text-[11px] font-semibold text-gold hover:underline"
              >
                <LinkIcon className="h-3 w-3" /> Open pay link
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (msg.kind === "shot" && msg.screenshotUrl) {
    const mine = msg.sender !== "player"; // support side = admin-typed AND system auto messages (Build 58 separation fix)
    return (
      <div className={cn("admin-msg-in flex py-1", mine ? "justify-end" : "justify-start")}>
        <button
          type="button"
          onClick={() => onViewShot(msg.screenshotUrl!, msg.screenshotCaption)}
          className="admin-focus overflow-hidden rounded-2xl border border-surface-border"
          aria-label="Open screenshot full screen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={msg.screenshotUrl}
            alt={msg.screenshotCaption ?? "Screenshot"}
            className="max-h-48 max-w-[240px] object-cover"
          />
        </button>
      </div>
    );
  }

  // text
  const mine = msg.sender !== "player"; // support side = admin-typed AND system auto messages (Build 58 separation fix)
  return (
    <div className={cn("admin-msg-in flex items-end gap-1.5 py-0.5", mine ? "justify-end" : "justify-start")}>
      {!mine && <Avatar name={playerName} size="sm" />}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 shadow-sm shadow-black/20",
          mine
            ? "rounded-br-md bg-gold text-navy"
            : "rounded-bl-md border border-surface-border bg-surface-card text-text-primary",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-normal">
          {msg.text}
        </p>
        <p
          className={cn(
            "mt-0.5 text-right text-[10px]",
            mine ? "text-navy/70" : "text-text-muted",
          )}
          title={fullDateTime(msg.createdAt)}
        >
          {bubbleTime(msg.createdAt)}
          {mine && receipt ? (
            <span className="ml-1 font-semibold">
              {receipt === "seen" ? "\u2713\u2713 Seen" : "\u2713 Delivered"}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/* ── Thread ────────────────────────────────────────────────────────────── */

function PanelRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14.5 4v16" />
    </svg>
  );
}

export default function ThreadView({
  admin,
  player,
  thread,
  games,
  gamesCount,
  methods,
  methodsCount,
  onMutated,
  onPrependOlder,
  onBack,
  onShowDetails,
  panelCollapsed,
  onTogglePanel,
}: {
  admin: AdminInfo;
  player: PlayerOverview;
  thread: ChatMessageView[];
  games: Array<{ id: string; name: string }>;
  gamesCount: number;
  methods: Array<{ id: string; name: string; brandColor: string | null }>;
  methodsCount: number;
  onMutated?: () => Promise<void>;
  /** Prepend older pages loaded by the thread itself (audit M3). */
  onPrependOlder?: (messages: ChatMessageView[]) => void;
  /** Mobile only: back to the player list / open the details panel. The
   *  thread header owns these now (Build 39 merged the shell's separate
   *  mobile nav bar into this one bar). */
  onBack?: () => void;
  onShowDetails?: () => void;
  /** Desktop: details-panel collapse (Build 50). */
  panelCollapsed?: boolean;
  onTogglePanel?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendListBusy, setSendListBusy] = useState<"games" | "pay" | "single" | "single-method" | null>(null);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; caption: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Older-history paging (audit M3): the button shows while a full
  // window is on screen and the server has not said "no more".
  // Per-player exhaustion flags (audit M3): keyed by player so switching
  // conversations needs no reset effect (set-state-in-effect is linted).
  const [olderExhaustedByPlayer, setOlderExhaustedByPlayer] = useState<
    Record<string, boolean>
  >({});
  const olderExhausted = olderExhaustedByPlayer[player.id] ?? false;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const restoreRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);

  // Live "player is typing" via Realtime broadcast (Meta Business style).
  const [playerTyping, setPlayerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`typing:${player.id}`)
      .on("broadcast", { event: "typing" }, (msg) => {
        const from = (msg.payload as { from?: string } | null)?.from;
        if (from !== "player") return;
        setPlayerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPlayerTyping(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [player.id]);

  const broadcastAdminTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2500) return;
    lastTypingSentRef.current = now;
    void typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: "admin" },
    });
  }, []);

  // Instant local refetch after any send/action (no full page refresh).
  async function changed() {
    if (onMutated) await onMutated();
  }

  // Scroll to bottom only when the NEWEST message changes (or the
  // player switches) — not on every poll refresh, so reading older
  // history no longer gets yanked to the bottom every 10 s.
  const lastMessageId = thread[thread.length - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, player.id]);

  // After prepending older pages, keep the view stable instead of
  // jumping: the height was captured in loadOlder before the state
  // change, so shift scrollTop by exactly the added height.
  useEffect(() => {
    const el = scrollRef.current;
    const pending = restoreRef.current;
    if (el && pending) {
      el.scrollTop = pending.prevTop + (el.scrollHeight - pending.prevHeight);
      restoreRef.current = null;
    }
  }, [thread]);

  async function loadOlder() {
    const oldest = thread[0];
    if (!oldest || loadingOlder) return;
    const playerIdAtStart = player.id;
    const el = scrollRef.current;
    restoreRef.current = el
      ? { prevHeight: el.scrollHeight, prevTop: el.scrollTop }
      : null;
    setLoadingOlder(true);
    try {
      const page = await getThreadOlder(playerIdAtStart, {
        beforeCreatedAt: new Date(oldest.createdAt).toISOString(),
        beforeId: oldest.id,
      });
      if (player.id !== playerIdAtStart) return;
      onPrependOlder?.(page.messages);
      if (!page.hasMore) {
        setOlderExhaustedByPlayer((prev) => ({ ...prev, [playerIdAtStart]: true }));
      }
    } catch {
      restoreRef.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendText() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendAdminMessage(admin.id, { playerId: player.id, text });
      setDraft("");
      await changed();
    } catch {
      // keep draft
    } finally {
      setSending(false);
    }
  }

  // Text shortcuts (Build 59): enabled shortcuts load once per admin and
  // expand inline while typing (key + space). Fails soft to none.
  const [shortcutMap, setShortcutMap] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let alive = true;
    getShortcutsForChat(admin.id)
      .then((list) => {
        if (alive) setShortcutMap(new Map(list.map((s) => [s.key, s.expansion])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [admin.id]);

  // Auto-growing composer (Build 59): grows with the text up to a cap,
  // then scrolls — like a professional chat system. The cap is also
  // viewport-relative so the box never eats a small window: at most
  // 150px, and at most a quarter of the window height.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150, Math.floor(window.innerHeight * 0.25))}px`;
  }, [draft]);

  const imageInputRef = useRef<HTMLInputElement>(null);

  async function sendImageFile(file: File) {
    if (sending) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("screenshot", file);
      await adminSendChatImage(admin.id, player.id, fd);
      await changed();
    } catch {
      // keep composer state
    } finally {
      setSending(false);
    }
  }

  async function quickReply(key: string) {
    try {
      await sendQuickReply(admin.id, { playerId: player.id, key });
      await changed();
    } catch {
      // ignore
    }
  }

  async function sendList(kind: "games" | "pay") {
    if (sendListBusy) return;
    setSendListBusy(kind);
    try {
      if (kind === "games") await sendGamesList(admin.id, player.id);
      else await sendPayList(admin.id, player.id);
      await changed();
    } finally {
      setSendListBusy(null);
    }
  }

  async function sendOneGame(gameId: string, gameName: string) {
    if (sendListBusy) return;
    setSendListBusy("single");
    setGamesOpen(false); // Chips disappear immediately
    try {
      // 1. Send "Sure! Let me set up your account" message
      await sendAdminMessage(admin.id, {
        playerId: player.id,
        text: `Sure! Let me set up your ${gameName} account — one moment… 🎮`,
      });
      // 2. Send the single game
      await sendSingleGame(admin.id, player.id, gameId);
      await changed();
    } finally {
      setSendListBusy(null);
    }
  }

  async function sendOneMethod(methodId: string, methodName: string) {
    if (sendListBusy) return;
    setSendListBusy("single-method");
    setPayOpen(false); // Panel closes immediately, same as games
    try {
      // 1. Short lead-in so the card doesn't land without context
      await sendAdminMessage(admin.id, {
        playerId: player.id,
        text: `Here are the ${methodName} payment details 👇`,
      });
      // 2. Send that method's payment card
      await sendSingleMethod(admin.id, player.id, methodId);
      await changed();
    } finally {
      setSendListBusy(null);
    }
  }

  const lastAdminTextId = (() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const m = thread[i];
      if (m.sender === "admin" && m.kind === "text") return m.id;
    }
    return null;
  })();

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Thread header — ONE merged bar (Build 39): mobile back + details
          live here; the shell's separate mobile nav bar is gone. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-surface-border bg-navy px-2.5 py-2 md:px-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to player list"
            className="admin-focus -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[22px] leading-none text-gold transition hover:bg-surface-elevated md:hidden"
          >
            ‹
          </button>
        ) : null}
        <Avatar name={player.displayName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold text-text-primary">
            {player.displayName}
            {player.isOnline && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
            )}
          </p>
          <p className="truncate text-[11px] text-text-muted">
            {player.tags.length > 0 ? player.tags.join(" · ") : "No tags"}
          </p>
        </div>
        {(player.pendingDeposits > 0 || player.creatingAccounts > 0) && (
          <span className="hidden shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold min-[420px]:inline-block">
            Needs your action
          </span>
        )}
        {onShowDetails ? (
          <button
            type="button"
            onClick={onShowDetails}
            className="admin-focus shrink-0 rounded-full border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/10 md:hidden"
          >
            Details
          </button>
        ) : null}
        {onTogglePanel ? (
          <button
            type="button"
            onClick={onTogglePanel}
            aria-label={panelCollapsed ? "Show player details panel" : "Hide player details panel"}
            title={panelCollapsed ? "Show details panel" : "Hide details panel"}
            className={`admin-focus hidden h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-surface-elevated md:flex ${
              panelCollapsed ? "text-gold" : "text-text-muted hover:text-gold"
            }`}
          >
            <PanelRightIcon className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {/* SEND bar — expandable games + payment methods (compact toolbar) */}
      <div className="shrink-0 border-b border-surface-border bg-surface-card/60 px-3 py-1.5 md:px-4">
        <div className="admin-thin-scroll flex items-center gap-1.5 overflow-x-auto">
          <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-text-muted min-[420px]:block">
            Send
          </span>
          <button
            type="button"
            onClick={() => {
              setGamesOpen((v) => !v);
              setPayOpen(false);
            }}
            disabled={sendListBusy !== null || gamesCount === 0}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gold/50 px-2.5 py-1 text-[11px] font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-40"
          >
            🎮 Games
            <span className={cn("transition-transform", gamesOpen && "rotate-180")}>▾</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPayOpen((v) => !v);
              setGamesOpen(false);
            }}
            disabled={sendListBusy !== null || methodsCount === 0}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-surface-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition hover:border-gold/50 hover:text-gold disabled:opacity-40"
          >
            💳 Payment methods
            <span className={cn("transition-transform", payOpen && "rotate-180")}>▾</span>
          </button>
        </div>
        {gamesOpen && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-xl border border-surface-border bg-navy p-2">
            <button
              type="button"
              onClick={() => sendList("games")}
              disabled={sendListBusy !== null}
              className="rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-navy hover:opacity-90 disabled:opacity-40"
            >
              {sendListBusy === "games" ? "Sending…" : `Send all ${gamesCount}`}
            </button>
            {games.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => sendOneGame(g.id, g.name)}
                disabled={sendListBusy !== null}
                className="rounded-full border border-gold/40 px-3 py-1.5 text-[11px] font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-40"
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
        {payOpen && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-xl border border-surface-border bg-navy p-2">
            <button
              type="button"
              onClick={() => sendList("pay")}
              disabled={sendListBusy !== null}
              className="rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-navy hover:opacity-90 disabled:opacity-40"
            >
              {sendListBusy === "pay" ? "Sending…" : `Send all ${methodsCount}`}
            </button>
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => sendOneMethod(m.id, m.name)}
                disabled={sendListBusy !== null}
                className="flex items-center gap-1.5 rounded-full border border-gold/40 px-3 py-1.5 text-[11px] font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-40"
              >
                {m.brandColor ? (
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: m.brandColor }}
                  />
                ) : null}
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        aria-live="polite"
        className="admin-chat-scroll min-h-0 flex-1 overflow-y-auto bg-near-black px-3 py-3 md:px-4"
      >
        {thread.length >= 500 && !olderExhausted ? (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            className="admin-focus mb-2 w-full rounded-md border border-surface-border bg-surface-card py-2 text-xs font-semibold text-text-primary transition hover:text-gold disabled:opacity-40"
          >
            {loadingOlder ? "Loading…" : "Load older messages"}
          </button>
        ) : null}
        {thread.length === 0 ? (
          <p className="mt-8 text-center text-xs text-text-muted">
            No messages yet. Say hello or send the game list above.
          </p>
        ) : (
          thread.map((m) => (
            <MessageItem
              key={m.id}
              admin={admin}
              playerName={player.displayName}
              msg={m}
              onViewShot={(src, caption) => setViewer({ src, caption })}
              onMutated={changed}
              receipt={
                m.id === lastAdminTextId
                  ? m.readByPlayer
                    ? "seen"
                    : "delivered"
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* Quick replies */}
      <div className="admin-thin-scroll flex shrink-0 gap-1.5 overflow-x-auto border-t border-surface-border bg-navy px-3 py-1.5">
        {Object.entries(QUICK_REPLIES).map(([key, q]) => (
          <button
            key={key}
            type="button"
            onClick={() => quickReply(key)}
            title={q.message}
            className="admin-focus shrink-0 rounded-full border border-surface-border bg-surface-card px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-gold/50 hover:text-gold"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Player typing indicator */}
      {playerTyping ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-surface-border bg-navy px-4 py-1.5">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:300ms]" />
          </span>
          <span className="text-[11px] text-text-muted">
            {player.displayName} is typing\u2026
          </span>
        </div>
      ) : null}

      {/* Composer — round pill input + round send, player-chat parity */}
      <div
        className="flex shrink-0 items-center gap-2 border-t border-surface-border bg-navy px-3 py-2"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void sendImageFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={sending}
          aria-label="Send an image"
          title="Send an image (or paste one)"
          className="admin-focus flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-surface-border text-text-secondary transition hover:text-gold disabled:opacity-40"
        >
          <ImageIcon className="h-[18px] w-[18px]" />
        </button>
        <textarea
          ref={composerRef}
          rows={1}
          value={draft}
          onChange={(e) => {
            const el = e.target;
            // Text expander (Build 59): "key + space" expands inline,
            // cursor lands right after the expansion.
            const res =
              shortcutMap.size > 0
                ? expandShortcut(
                    el.value,
                    el.selectionStart ?? el.value.length,
                    shortcutMap,
                  )
                : null;
            if (res) {
              setDraft(res.value);
              requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(res.cursor, res.cursor);
              });
            } else {
              setDraft(el.value);
            }
            broadcastAdminTyping();
          }}
          onPaste={(e) => {
            const file = e.clipboardData?.files?.[0];
            if (file && file.type.startsWith("image/")) {
              e.preventDefault();
              void sendImageFile(file);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder={`Message ${player.displayName}…`}
          aria-label="Message"
          className="admin-focus max-h-[min(150px,25vh)] min-h-[42px] min-w-0 flex-1 resize-none overflow-y-auto rounded-[22px] border border-surface-border bg-surface-input px-3.5 py-2.5 text-[13.5px] leading-snug text-text-primary placeholder:text-text-muted"
        />
        <button
          type="button"
          onClick={sendText}
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="admin-focus flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gold text-navy transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <SendIcon className="h-[18px] w-[18px]" />
        </button>
      </div>

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
