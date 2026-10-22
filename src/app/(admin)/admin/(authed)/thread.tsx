"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import type { AdminInfo, ChatMessageView, PlayerOverview } from "../../_actions";
import {
  decryptAccountPassword,
  markAccountActive,
  sendAdminMessage,
  sendGamesList,
  sendPayList,
  sendQuickReply,
  sendSingleGame,
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
} from "@/components/icons";
import ScreenshotViewer from "./screenshot-viewer";
import { Avatar, StatusChip, bubbleTime, fullDateTime } from "./ui-bits";

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
    <div className="w-[400px] max-w-full rounded-lg border border-gold/30 bg-surface-elevated p-3 shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
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
              onClick={copy}
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
        <button
          type="button"
          onClick={approve}
          disabled={approving}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[13px] font-bold text-[#03231a] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
        >
          <CheckIcon className="h-4 w-4" />
          {approving ? "Approving…" : "Approve — Mark as Active"}
        </button>
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
        <span className="max-w-[80%] rounded-full bg-surface-elevated px-3 py-1 text-center text-[11px] text-text-secondary">
          {msg.text}
        </span>
      </div>
    );
  }

  if (msg.kind === "account" && msg.account) {
    const mine = msg.sender === "admin";
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

  if (msg.kind === "games_list" || msg.kind === "pay_list") {
    return (
      <div className="admin-msg-in flex justify-end py-1">
        <div className="w-[400px] max-w-full rounded-lg border border-surface-border bg-surface-card p-3">
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
        <div className="w-[400px] max-w-full overflow-hidden rounded-lg border border-gold/30 bg-surface-card shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
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
            {card.payLink && (
              <a
                href={card.payLink}
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
    const mine = msg.sender === "admin";
    return (
      <div className={cn("admin-msg-in flex py-1", mine ? "justify-end" : "justify-start")}>
        <button
          type="button"
          onClick={() => onViewShot(msg.screenshotUrl!, msg.screenshotCaption)}
          className="admin-focus overflow-hidden rounded-lg border border-surface-border"
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
  const mine = msg.sender === "admin";
  return (
    <div className={cn("admin-msg-in flex items-end gap-1.5 py-0.5", mine ? "justify-end" : "justify-start")}>
      {!mine && <Avatar name={playerName} size="sm" />}
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-2.5 py-1.5",
          mine ? "bg-gold text-navy" : "bg-surface-card text-text-primary",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-[13px] leading-snug">
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

export default function ThreadView({
  admin,
  player,
  thread,
  games,
  gamesCount,
  methodsCount,
  onMutated,
}: {
  admin: AdminInfo;
  player: PlayerOverview;
  thread: ChatMessageView[];
  games: Array<{ id: string; name: string }>;
  gamesCount: number;
  methodsCount: number;
  onMutated?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendListBusy, setSendListBusy] = useState<"games" | "pay" | "single" | null>(null);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; caption: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, player.id]);

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

  const lastAdminTextId = (() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const m = thread[i];
      if (m.sender === "admin" && m.kind === "text") return m.id;
    }
    return null;
  })();

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Thread header */}
      <div className="flex shrink-0 items-center justify-between border-b border-surface-border bg-navy px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={player.displayName} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-text-primary">
              {player.displayName}
              {player.isOnline && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
              )}
            </p>
            <p className="truncate text-[11px] text-text-muted">
              {player.tags.length > 0 ? player.tags.join(" · ") : "No tags"}
            </p>
          </div>
        </div>
        {(player.pendingDeposits > 0 || player.creatingAccounts > 0) && (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">
            Needs your action
          </span>
        )}
      </div>

      {/* SEND bar — expandable games + payment methods */}
      <div className="shrink-0 border-b border-surface-border bg-surface-card/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Send
          </span>
          <button
            type="button"
            onClick={() => setGamesOpen((v) => !v)}
            disabled={sendListBusy !== null || gamesCount === 0}
            className="flex items-center gap-1.5 rounded-full border border-gold/50 px-3 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-40"
          >
            🎮 Games
            <span className={cn("transition-transform", gamesOpen && "rotate-180")}>▾</span>
          </button>
          <button
            type="button"
            onClick={() => sendList("pay")}
            disabled={sendListBusy !== null || methodsCount === 0}
            className="flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-gold/50 hover:text-gold disabled:opacity-40"
          >
            💳 Payment methods ▾
          </button>
        </div>
        {gamesOpen && (
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl border border-surface-border bg-navy p-2.5">
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
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        aria-live="polite"
        className="admin-chat-scroll min-h-0 flex-1 overflow-y-auto bg-near-black px-4 py-3"
      >
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

      {/* Composer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-surface-border bg-navy px-3 py-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            broadcastAdminTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder={`Message ${player.displayName}…`}
          aria-label="Message"
          className="admin-focus min-w-0 flex-1 rounded-md border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
        />
        <button
          type="button"
          onClick={sendText}
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="admin-focus rounded-md bg-gold p-2 text-navy transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <SendIcon className="h-4 w-4" />
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
