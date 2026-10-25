"use client";

import { useCallback, useEffect, useRef, useState } from "react";import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  LinkIcon,
  SendIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";
import { validateDepositAmount } from "@/lib/utils";
import { mergeThreadMessages } from "@/lib/thread-merge";
import {
  chatPick,
  getAccountCard,
  getScreenshotUrl,
  getThread,
  getThreadOlder,
  markThreadRead,
  sendChatMessage,
  sendChatImage,
  submitChatDeposit,
} from "../_actions";
import type { AccountCard, ChatMessage } from "../_types";
import { safeHref } from "@/lib/urls";

/* ── body helpers ─────────────────────────────────────────────────────────── */

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* Echo ids must stay unique even when two echoes are appended in the
   same tick. Module scope keeps the React Compiler purity lint happy. */
let echoSeq = 0;
function nextEchoId(): string {
  echoSeq += 1;
  return `echo-${Date.now()}-${echoSeq}`;
}

/* ── full-screen image viewer ─────────────────────────────────────────────── */

function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close viewer"
        className="absolute right-4 top-4 rounded-full bg-surface-card p-2 text-text-primary"
      >
        <XIcon className="h-6 w-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Chat screenshot full view"
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/* ── screenshot message ───────────────────────────────────────────────────── */

function ShotMessage({
  message,
  resolvedUrl,
}: {
  message: ChatMessage;
  resolvedUrl?: string | null;
}) {
  const path = str(message.body["screenshot_path"]);
  const caption = str(message.body["caption"]);
  const mine = message.sender === "player";
  const [url, setUrl] = useState<string | null>(resolvedUrl ?? null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    // Server batch-resolved most URLs (page.tsx); only fetch when missing
    // (e.g. a screenshot that arrived live after the page loaded).
    if (resolvedUrl) return;
    let cancelled = false;
    if (path) {
      getScreenshotUrl(path).then((u) => {
        if (!cancelled) setUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [path, resolvedUrl]);

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="flex max-w-[75%] flex-col">
        <p
          className={`mb-1 text-[10px] font-semibold tracking-wide ${
            mine ? "text-right text-text-muted" : "text-gold/80"
          }`}
        >
          {mine ? "You" : "Support"}
        </p>
        <button
          type="button"
          onClick={() => url && setViewerOpen(true)}
          className="block overflow-hidden rounded-xl border border-surface-border"
          aria-label="Open screenshot full screen"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={caption || "Screenshot"}
              className="max-h-56 w-full object-cover"
            />
          ) : (
            <span className="flex h-32 w-44 items-center justify-center bg-surface-card text-text-muted">
              <ImageIcon className="h-8 w-8" />
            </span>
          )}
        </button>
        {caption ? (
          <p className="mt-1 text-xs text-text-secondary">{caption}</p>
        ) : null}
        <p className="mt-0.5 text-right text-[10px] text-text-muted">
          {formatTime(message.created_at)}
        </p>
        {viewerOpen && url ? (
          <ImageViewer src={url} onClose={() => setViewerOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}

/* ── account credential card ──────────────────────────────────────────────── */

function AccountCardMessage({
  message,
  resolvedCard,
}: {
  message: ChatMessage;
  resolvedCard?: AccountCard | null;
}) {
  const accountId = str(message.body["account_id"]);
  const bodyStatus = message.body["status"] === "active" ? "active" : "creating";
  const [card, setCard] = useState<AccountCard | null>(resolvedCard ?? null);
  // Deleted account (v2 Phase 2, audit M15): the row is gone, so the
  // fetch resolves null — show an explicit note instead of a "Creating…"
  // ghost card that never resolves. Transient errors keep the loading
  // state (catch below swallows them on purpose).
  const [deleted, setDeleted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);

  useEffect(() => {
    // Server batch-resolved this card (page.tsx) and its status matches the
    // message body — nothing to fetch. Otherwise fetch (live-arrived cards,
    // and the approve flip: bodyStatus changes -> fresh credentials).
    if (resolvedCard && resolvedCard.status === bodyStatus) {
      return; // state was initialized from resolvedCard — already current
    }
    let cancelled = false;
    if (accountId) {
      getAccountCard(accountId)
        .then((c) => {
          if (cancelled) return;
          if (c) setCard(c);
          else setDeleted(true);
        })
        .catch(() => {
          // Transient fetch failure — stay in the loading state.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [accountId, bodyStatus, resolvedCard]);

  if (deleted) {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-full bg-surface-card px-4 py-1.5 text-center text-xs italic text-text-secondary">
          This game account was deleted.
        </p>
      </div>
    );
  }

  // R2: the same card flips Creating… → Active in place (no second card).
  const status = card?.status ?? bodyStatus;
  const active = status === "active";

  async function copyPassword() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function copyUsername() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.username);
      setCopiedUser(true);
      setTimeout(() => setCopiedUser(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-gold/40 bg-surface-card shadow-xl shadow-black/25">
        <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-gold to-gold-light px-4 py-2.5">
          <p className="min-w-0 truncate text-sm font-extrabold text-text-ongold">
            {card?.gameName ?? "Game account"}
          </p>
          {active ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-ongold">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Active
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-ongold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-ongold" />
              Creating
            </span>
          )}
        </div>
        <div className="space-y-2.5 p-4">
          <div className="rounded-xl bg-surface-input px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Username
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="truncate font-mono text-sm font-bold text-text-primary">
                {card?.username ?? "…"}
              </p>
              <button
                type="button"
                onClick={copyUsername}
                aria-label="Copy username"
                className="shrink-0 rounded-lg p-1.5 text-text-secondary transition hover:text-gold"
              >
                {copiedUser ? (
                  <CheckIcon className="h-4 w-4 text-success" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div className="rounded-xl bg-surface-input px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Password
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="truncate font-mono text-sm font-bold text-text-primary">
                {showPassword ? (card?.password ?? "…") : "••••••••"}
              </p>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="rounded-lg p-1.5 text-text-secondary transition hover:text-gold"
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={copyPassword}
                  aria-label="Copy password"
                  className="rounded-lg p-1.5 text-text-secondary transition hover:text-gold"
                >
                  {copied ? (
                    <CheckIcon className="h-4 w-4 text-success" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-text-muted">
              {active
                ? "Your login is ready"
                : "Support is setting up your login…"}
            </span>
            <span className="text-[10px] text-text-muted">
              {formatTime(message.created_at)}
            </span>
          </div>
          {active ? (
            <Link
              href="/app/accounts"
              className="block rounded-xl bg-gold py-2.5 text-center text-sm font-bold text-text-ongold transition hover:brightness-110"
            >
              Open My Game Account →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── pickers: games_list / pay_list ───────────────────────────────────────── */

interface PickItem {
  id: string;
  name: string;
  handle?: string;
  brand_color?: string | null;
}

function PickerMessage({
  message,
  items,
  title,
  onPicked,
  onPickStart,
}: {
  message: ChatMessage;
  items: PickItem[];
  title: string;
  onPicked: () => void;
  onPickStart?: () => void;
}) {
  const serverPicked = message.body["picked"] as
    | { id: string; at: string }
    | null
    | undefined;
  // Optimistic pick: the chip turns gold the instant it is tapped —
  // previously nothing visibly changed until the server round trip +
  // poll came back, so the screen looked dead after a pick.
  const [optimisticPicked, setOptimisticPicked] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const picked = optimisticPicked
    ? { id: optimisticPicked, at: new Date().toISOString() }
    : serverPicked;
  const [picking, setPicking] = useState(false);

  async function pick(id: string) {
    if (picked || picking) return;
    setPicking(true);
    setPickError(null);
    setOptimisticPicked(id);
    onPickStart?.();
    try {
      const res = await chatPick(message.id, id);
      if (res.ok) {
        onPicked();
      } else {
        setOptimisticPicked(null);
        setPickError(res.error || "Couldn't select — tap again.");
      }
    } catch {
      setOptimisticPicked(null);
      setPickError("Couldn't select — tap again.");
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-xl shadow-black/25">
        <div className="border-b border-surface-border px-4 py-3">
          <p className="text-sm font-bold text-text-primary">{title}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {picked
              ? `Picked · ${formatTime(picked.at)}`
              : "Tap one to continue"}
          </p>
        </div>
        {/* Chips layout (Build 46 — skeleton style, replaces rows) */}
        <div className="flex flex-wrap gap-1.5 p-3">
          {items.map((item) => {
            const isPicked = picked?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!!picked || picking}
                onClick={() => pick(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-bold leading-none transition ${
                  isPicked
                    ? "border-gold bg-gold text-text-ongold shadow-lg shadow-gold/25"
                    : "border-surface-border bg-surface-elevated/70 text-text-primary hover:border-gold/60 hover:text-gold"
                } ${picked && !isPicked ? "opacity-40" : ""}`}
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${
                    isPicked ? "bg-black/20" : "bg-gold/15 text-gold"
                  }`}
                  style={
                    item.brand_color && !isPicked
                      ? { backgroundColor: item.brand_color, color: "#fff" }
                      : undefined
                  }
                >
                  {item.name.charAt(0).toUpperCase()}
                </span>
                {item.name}
                {item.handle ? (
                  <span
                    className={`text-[11px] font-semibold ${
                      isPicked ? "opacity-75" : "text-text-muted"
                    }`}
                  >
                    {item.handle}
                  </span>
                ) : null}
                {isPicked ? (
                  <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
        {pickError ? (
          <p className="px-3 pb-2.5 text-[11px] font-medium text-danger">
            {pickError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── payment card (deposit via chat) ──────────────────────────────────────── */

function PaymentCardMessage({
  message,
  onDepositSend,
}: {
  message: ChatMessage;
  onDepositSend: (args: {
    methodId: string;
    methodName: string;
    amount: string;
    file: File;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const snapshot = (message.body["snapshot"] ?? {}) as {
    name?: string;
    account_name?: string | null;
    brand_color?: string | null;
    handle?: string;
    note?: string | null;
    pay_link?: string | null;
  };
  const methodId = str(message.body["payment_method_id"]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyHandle() {
    if (!snapshot.handle) return;
    try {
      await navigator.clipboard.writeText(snapshot.handle);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  async function handleUpload() {
    setError(null);
    const amountError = validateDepositAmount(Number(amount));
    if (amountError) {
      setError(amountError);
      return;
    }
    if (!file) {
      setError("Attach your payment screenshot.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Screenshot must be under 8 MB.");
      return;
    }
    setSubmitting(true);
    try {
      // Instant echo first: onDepositSend puts the screenshot + caption
      // in the thread immediately, then runs the server work on the send
      // queue. The form only closes when the server confirms.
      const result = await onDepositSend({
        methodId,
        methodName: snapshot.name ?? "Payment method",
        amount,
        file,
      });
      if (result.ok) {
        setDone(true);
        setUploadOpen(false);
      } else {
        setError(
          result.error ??
            "Upload failed — check your connection and try again.",
        );
      }
    } catch {
      // Never fail silently — the player must always see what happened.
      setError("Upload failed — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const methodName = snapshot.name ?? "Payment method";
  const brandBg = snapshot.brand_color ?? undefined;

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-gold/40 bg-surface-card shadow-xl shadow-black/25">
        {/* Header band — brand tile + label + Deposit tag */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{
            background: brandBg ?? "linear-gradient(135deg, #f0cd6a, #d4af37)",
            color: brandBg ? "#ffffff" : "#241a02",
          }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg font-extrabold">
            {methodName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-widest opacity-80">
              Payment method
            </span>
            <span className="block truncate text-[16px] font-extrabold leading-tight">
              {methodName}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            Deposit
          </span>
        </div>

        {/* Body — labelled rows */}
        <div className="p-4">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Here are the {methodName} details — tap Pay to send your payment,
            then tap “I’ve paid” to upload your screenshot and we’ll load your
            credits as soon as it’s verified.
          </p>
          <dl className="mt-3 space-y-2.5">
            {snapshot.account_name ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                  Name
                </dt>
                <dd className="text-right text-[13px] font-semibold text-text-primary">
                  {snapshot.account_name}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Send to
              </dt>
              <dd className="flex items-center gap-1.5">
                <span className="rounded-lg bg-surface-input px-2.5 py-1.5 font-mono text-[13px] font-bold text-gold">
                  {snapshot.handle ?? ""}
                </span>
                <button
                  type="button"
                  onClick={copyHandle}
                  aria-label="Copy payment handle"
                  className="rounded-lg border border-surface-border p-1.5 text-text-muted transition hover:text-gold"
                >
                  {copied ? (
                    <CheckIcon className="h-4 w-4 text-success" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </button>
              </dd>
            </div>
            {snapshot.note ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                  Note
                </dt>
                <dd className="text-right text-[13px] text-text-secondary">
                  {snapshot.note}
                </dd>
              </div>
            ) : null}
          </dl>
          {safeHref(snapshot.pay_link) ? (
            <a
              href={safeHref(snapshot.pay_link) ?? ""}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gold text-sm font-bold text-text-ongold transition hover:brightness-110"
            >
              <LinkIcon className="h-4 w-4" />
              Pay with {methodName}
            </a>
          ) : (
            <p className="mt-4 rounded-xl bg-gold/10 px-3 py-2.5 text-xs font-semibold text-gold-light">
              No pay link — send manually to the handle above, then upload your
              screenshot.
            </p>
          )}
        {done ? (
          <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-success/10 px-3 py-2.5 text-xs font-bold text-success">
            <CheckIcon className="h-4 w-4" />
            Screenshot received — an agent will verify it shortly.
          </p>
        ) : uploadOpen ? (
          <div className="mt-3 space-y-2.5 rounded-xl border border-surface-border p-3">
            <label className="block">
              <span className="text-xs font-semibold text-text-secondary">
                Amount paid ($)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={5}
                max={5000}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2.5 text-sm font-bold text-text-primary focus:border-gold/60 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-text-secondary">
                Payment screenshot
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-xs text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-2 file:text-xs file:font-bold file:text-text-ongold"
              />
            </label>
            {error ? (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-lg border border-surface-border px-3 py-2 text-xs font-bold text-text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-text-ongold disabled:opacity-60"
              >
                <UploadIcon className="h-4 w-4" />
                {submitting ? "Uploading…" : "Send screenshot"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-gold/60 text-sm font-bold text-gold transition hover:bg-gold/10"
          >
            <UploadIcon className="h-4 w-4" />
            I’ve paid — upload screenshot
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

/* ── one message ──────────────────────────────────────────────────────────── */

function MessageView({
  message,
  onPicked,
  onPickStart,
  onDepositSend,
  receipt,
  resolvedCard,
  resolvedShotUrl,
}: {
  message: ChatMessage;
  onPicked: (kind: ChatMessage["kind"]) => void;
  onPickStart: (kind: ChatMessage["kind"]) => void;
  onDepositSend: (args: {
    methodId: string;
    methodName: string;
    amount: string;
    file: File;
  }) => Promise<{ ok: boolean; error?: string }>;
  receipt?: "sent" | "seen";
  resolvedCard?: AccountCard | null;
  resolvedShotUrl?: string | null;
}) {
  const mine = message.sender === "player";

  if (message.kind === "shot")
    return <ShotMessage message={message} resolvedUrl={resolvedShotUrl} />;
  if (message.kind === "account")
    return <AccountCardMessage message={message} resolvedCard={resolvedCard} />;
  if (message.kind === "system" || message.kind === "player_note") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-full bg-surface-card px-4 py-1.5 text-center text-xs italic text-text-secondary">
          {str(message.body["text"])}
        </p>
      </div>
    );
  }
  if (message.kind === "games_list") {
    const items = arr<{ id: string; name: string }>(
      message.body["games"],
    ).filter((g) => g && typeof g.id === "string" && typeof g.name === "string");
    return (
      <PickerMessage
        message={message}
        items={items}
        title={str(message.body["title"]) || "Pick a game"}
        onPicked={() => onPicked(message.kind)}
        onPickStart={() => onPickStart(message.kind)}
      />
    );
  }
  if (message.kind === "pay_list") {
    const items = arr<{
      id: string;
      name: string;
      handle: string;
      brand_color: string | null;
    }>(message.body["methods"]).filter(
      (m) => m && typeof m.id === "string" && typeof m.name === "string",
    );
    return (
      <PickerMessage
        message={message}
        items={items}
        title={str(message.body["title"]) || "Choose how to pay"}
        onPicked={() => onPicked(message.kind)}
        onPickStart={() => onPickStart(message.kind)}
      />
    );
  }
  if (message.kind === "payment_card") {
    return (
      <PaymentCardMessage message={message} onDepositSend={onDepositSend} />
    );
  }

  // text — own messages gold/right, support messages dark/left, each
  // with a small sender label so the two sides are unmistakable.
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <p
        className={`mb-1 text-[10px] font-semibold tracking-wide ${
          mine ? "pr-1 text-text-muted" : "pl-1 text-gold/80"
        }`}
      >
        {mine ? "You" : "Support"}
      </p>
      <div
        className={`max-w-[min(82%,680px)] rounded-2xl px-[13px] py-[9px] text-[14.5px] leading-[1.45] shadow-sm shadow-black/20 ${
          mine
            ? "rounded-br-[5px] bg-gold font-semibold text-gold-ink"
            : "rounded-bl-[5px] border border-line bg-card-2 text-ink"
        }`}
      >
        <p className="whitespace-pre-line break-words">
          {str(message.body["text"])}
        </p>
        <p className="mt-1 text-right text-[10px] text-ink-3">
          {formatTime(message.created_at)}
        </p>
      </div>
      {mine && receipt ? (
        <p className="mt-1 pr-1 text-[10px] font-medium text-text-muted">
          {receipt === "seen" ? (
            <span className="text-gold">{"\u2713\u2713"} Seen</span>
          ) : (
            "\u2713 Sent"
          )}
        </p>
      ) : null}
    </div>
  );
}

/* ── the chat screen ──────────────────────────────────────────────────────── */

export default function ChatClient({
  playerId,
  initialMessages,
  initialCards,
  initialShotUrls,
}: {
  playerId: string;
  initialMessages: ChatMessage[];
  initialCards: Record<string, AccountCard>;
  initialShotUrls: Record<string, string>;
}) {
  // Thread arrives server-rendered (see page.tsx) — no loading spinner.
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  // Older-history paging (audit M3): the button shows while a full
  // window is on screen and the server has not said "no more".
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasOlderRef = useRef(false);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Own sends render instantly (echoes) — previously a sent message
  // appeared only after the server round trip + refresh, so the player
  // saw nothing but the "agent is typing" dots after hitting send.
  // The refresh prunes each echo once its real message lands.
  const [echoes, setEchoes] = useState<ChatMessage[]>([]);
  // Blob URLs for image echoes, keyed by echo id. State (not a ref) so
  // rendering may read it — the React Compiler lint forbids ref reads
  // during render.
  const [echoShotUrls, setEchoShotUrls] = useState<Record<string, string>>({});
  // Send queue: rapid sends must never wait on the send button. Each
  // tap echoes instantly; server work runs in tap order, so no message
  // is lost and server order always matches send order.
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Greeting flag read at server-work time, not tap time: with queued
  // sends the tap-time value can be stale and the welcome would repeat.
  const greetedRef = useRef(
    typeof window !== "undefined" &&
      sessionStorage.getItem("pv_greeted") === "1",
  );
  // Own sends + server thread, in order. Everything below renders this.
  const visibleMessages = [...messages, ...echoes];

  function makeEcho(
    kind: ChatMessage["kind"],
    body: Record<string, unknown>,
  ): ChatMessage {
    return {
      id: nextEchoId(),
      player_id: playerId,
      sender: "player",
      kind,
      body,
      is_read_by_admin: false,
      is_read_by_player: true,
      created_at: new Date().toISOString(),
    };
  }

  // Render-time derivation (the set-state-in-effect lint forbids
  // pruning this in an effect): only echoes still on screen keep a
  // URL for display. Revocation of pruned URLs happens in the effect
  // below, which sets no state.
  const liveEchoShotUrls = Object.fromEntries(
    Object.entries(echoShotUrls).filter(([id]) =>
      echoes.some((e) => e.id === id),
    ),
  );
  const prevEchoIdsForUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(echoes.map((e) => e.id));
    for (const id of prevEchoIdsForUrlsRef.current) {
      if (!current.has(id) && echoShotUrls[id]) {
        URL.revokeObjectURL(echoShotUrls[id]);
      }
    }
    prevEchoIdsForUrlsRef.current = current;
  }, [echoes, echoShotUrls]);
  // Unmount: revoke anything still alive.
  const echoShotUrlsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    echoShotUrlsRef.current = echoShotUrls;
  });
  useEffect(() => {
    const ref = echoShotUrlsRef;
    return () => {
      for (const url of Object.values(ref.current)) URL.revokeObjectURL(url);
    };
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Real-chat feel: live typing indicator (admin typing via Realtime
  // broadcast) + a short "agent is typing" beat while an auto-reply lands.
  const [agentTyping, setAgentTyping] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const lastTypingSentRef = useRef(0);

  const noteAwaiting = useCallback(() => {
    setAwaitingReply(true);
    if (awaitingTimeoutRef.current) clearTimeout(awaitingTimeoutRef.current);
    awaitingTimeoutRef.current = setTimeout(() => setAwaitingReply(false), 6000);
  }, []);

  // Build 57 — deterministic "agent is preparing" typing beat, driven HERE
  // because the server-side typing broadcast proved unreliable in live
  // tests: dots run after a game pick until the account card lands, and
  // after a card flips to Active until the "ready" message lands.
  const [preparing, setPreparing] = useState(false);
  const preparingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preparingTargetRef = useRef<{ kind: string; knownIds: Set<string> } | null>(null);
  const messagesRef = useRef<ChatMessage[]>(initialMessages);

  const stopPreparing = useCallback(() => {
    preparingTargetRef.current = null;
    setPreparing(false);
    if (preparingTimeoutRef.current) clearTimeout(preparingTimeoutRef.current);
  }, []);

  const startPreparing = useCallback(
    (targetKind: string) => {
      preparingTargetRef.current = {
        kind: targetKind,
        knownIds: new Set(messagesRef.current.map((m) => m.id)),
      };
      setPreparing(true);
      if (preparingTimeoutRef.current) clearTimeout(preparingTimeoutRef.current);
      preparingTimeoutRef.current = setTimeout(() => stopPreparing(), 3500);
    },
    [stopPreparing],
  );


  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refresh = useCallback(async () => {
    // One refresh in flight at a time — but an event that arrives DURING
    // a refresh queues one more run instead of being dropped (Build 54;
    // a dropped event used to leave the chat stale until the slow poll).
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const thread = await getThread();
      // Build 57: detect an account card flipping to Active (admin approve)
      // so the typing beat can run until the "ready" text lands after it.
      const prevById = new Map(messagesRef.current.map((m) => [m.id, m]));
      const flippedActive = thread.some(
        (m) =>
          m.kind === "account" &&
          m.body["status"] === "active" &&
          prevById.has(m.id) &&
          prevById.get(m.id)?.body["status"] !== "active",
      );
      const newTextAlreadyLanded = thread.some(
        (m) => m.kind === "text" && !prevById.has(m.id),
      );
      // Merge keeps user-loaded older pages across polls (audit M3); a
      // short window means the full history fits, so stale older pages
      // drop and pagination resets.
      const merged = hasOlderRef.current
        ? mergeThreadMessages(messagesRef.current, thread, 500, (m) => m.created_at)
        : thread;
      if (thread.length < 500) {
        hasOlderRef.current = false;
        setOlderExhausted(false);
      }
      setMessages(merged);
      messagesRef.current = merged;
      setLoading(false);
      // Prune confirmed echoes: a local echo whose real message is in
      // this fresh thread drops out (the real one renders instead).
      // Sends are serialized by the queue, so at most one echo per
      // kind is unmatched at any refresh.
      setEchoes((prev) =>
        prev.filter(
          (e) =>
            !merged.some(
              (m) =>
                m.sender === e.sender &&
                m.kind === e.kind &&
                (e.kind !== "text" ||
                  str(m.body["text"]) === str(e.body["text"])) &&
                Date.parse(m.created_at) >= Date.parse(e.created_at) - 10000,
            ),
        ),
      );
      // A non-player message landing ends the "typing" beat.
      const last = thread[thread.length - 1];
      if (last && last.sender !== "player") setAwaitingReply(false);
      // Preparing beat ends when the awaited kind lands as a NEW message.
      const target = preparingTargetRef.current;
      if (
        target &&
        thread.some((m) => m.kind === target.kind && !target.knownIds.has(m.id))
      ) {
        stopPreparing();
      } else if (flippedActive && !newTextAlreadyLanded) {
        startPreparing("text");
      }
      void markThreadRead();
    } finally {
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refresh();
      }
    }
  }, [startPreparing, stopPreparing]);

  useEffect(() => {
    // Initial messages came with the page; just mark the thread read.
    void markThreadRead();
  }, []);

  // Safety net: Realtime does the live work; a 15s poll (visible tab
  // only) plus an instant refresh when the player returns to this
  // window/tab cover anything it might miss (Build 54).
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `player_id=eq.${playerId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [playerId, refresh]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`typing:${playerId}`)
      .on("broadcast", { event: "typing" }, (msg) => {
        const from = (msg.payload as { from?: string } | null)?.from;
        if (from !== "admin") return;
        setAgentTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setAgentTyping(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [playerId]);

  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2500) return;
    lastTypingSentRef.current = now;
    void typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: "player" },
    });
  }, []);

  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastMessageId, agentTyping, awaitingReply, preparing]);

  // After prepending older pages, keep the view stable: the height was
  // captured in loadOlder before the state change, so shift scrollTop
  // by exactly the added height.
  useEffect(() => {
    const el = threadScrollRef.current;
    const pending = restoreRef.current;
    if (el && pending) {
      el.scrollTop = pending.prevTop + (el.scrollHeight - pending.prevHeight);
      restoreRef.current = null;
    }
  }, [messages]);

  async function loadOlder() {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingOlder) return;
    const el = threadScrollRef.current;
    restoreRef.current = el
      ? { prevHeight: el.scrollHeight, prevTop: el.scrollTop }
      : null;
    setLoadingOlder(true);
    try {
      const page = await getThreadOlder({
        beforeCreatedAt: new Date(oldest.created_at).toISOString(),
        beforeId: oldest.id,
      });
      const existing = new Set(messagesRef.current.map((m) => m.id));
      const fresh = page.messages.filter((m) => !existing.has(m.id));
      const merged = [...fresh, ...messagesRef.current];
      messagesRef.current = merged;
      setMessages(merged);
      hasOlderRef.current = true;
      if (!page.hasMore) setOlderExhausted(true);
    } catch {
      restoreRef.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    const echo = makeEcho("text", { text: t });
    setEchoes((prev) => [...prev, echo]);
    setError(null);
    noteAwaiting();
    const work = sendQueueRef.current.then(async () => {
      try {
        const result = await sendChatMessage(t, greetedRef.current);
        if (!result.ok) {
          setError(result.error);
          setEchoes((prev) => prev.filter((e) => e.id !== echo.id));
          // Restore the lost message without clobbering newer typing.
          setInput((prev) => (prev ? `${t}\n${prev}` : t));
        } else if (result.greeted) {
          sessionStorage.setItem("pv_greeted", "1");
          greetedRef.current = true;
        }
      } catch {
        setEchoes((prev) => prev.filter((e) => e.id !== echo.id));
        setInput((prev) => (prev ? `${t}\n${prev}` : t));
      }
      void refresh();
    });
    sendQueueRef.current = work.catch(() => {});
  }

  const imageInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Auto-growing composer (Build 59): grows with the text up to a cap,
  // then scrolls — like a professional chat system.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  function sendImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    const echo = makeEcho("shot", {});
    setEchoShotUrls((prev) => ({ ...prev, [echo.id]: url }));
    setEchoes((prev) => [...prev, echo]);
    setError(null);
    noteAwaiting();
    const work = sendQueueRef.current.then(async () => {
      try {
        const fd = new FormData();
        fd.append("screenshot", file);
        const result = await sendChatImage(fd);
        if (!result.ok) {
          setError(result.error);
          setEchoes((prev) => prev.filter((e) => e.id !== echo.id));
          setEchoShotUrls((prev) => {
            const next = { ...prev };
            delete next[echo.id];
            return next;
          });
          URL.revokeObjectURL(url);
        }
      } catch {
        setEchoes((prev) => prev.filter((e) => e.id !== echo.id));
        setEchoShotUrls((prev) => {
          const next = { ...prev };
          delete next[echo.id];
          return next;
        });
        URL.revokeObjectURL(url);
      }
      void refresh();
    });
    sendQueueRef.current = work.catch(() => {});
  }

  // Deposit sends (payment card → "I've paid") get the same instant
  // treatment as image sends: the screenshot + caption echo appears
  // immediately, the server work runs on the send queue (order +
  // no-loss, same as text/image sends), a failure drops the echo and
  // reports back to the form, and refresh swaps the echo for the real
  // shot message when it lands.
  function sendDeposit(args: {
    methodId: string;
    methodName: string;
    amount: string;
    file: File;
  }): Promise<{ ok: boolean; error?: string }> {
    const url = URL.createObjectURL(args.file);
    const echo = makeEcho("shot", {
      caption: `Deposit $${args.amount} via ${args.methodName} — screenshot attached`,
    });
    setEchoShotUrls((prev) => ({ ...prev, [echo.id]: url }));
    setEchoes((prev) => [...prev, echo]);
    noteAwaiting();
    const work = sendQueueRef.current.then(async () => {
      try {
        const fd = new FormData();
        fd.set("amount", args.amount);
        fd.set("methodId", args.methodId);
        fd.set("screenshot", args.file);
        const result = await submitChatDeposit(fd);
        if (!result.ok) {
          setEchoes((prev) => prev.filter((e) => e.id !== echo.id));
          setEchoShotUrls((prev) => {
            const next = { ...prev };
            delete next[echo.id];
            return next;
          });
          URL.revokeObjectURL(url);
        }
        return result;
      } catch {
        setEchoes((prev) => prev.filter((e) => e.id !== echo.id));
        setEchoShotUrls((prev) => {
          const next = { ...prev };
          delete next[echo.id];
          return next;
        });
        URL.revokeObjectURL(url);
        return {
          ok: false,
          error: "Upload failed — check your connection and try again.",
        };
      } finally {
        void refresh();
      }
    });
    // The queue itself stays Promise<void> (the next send waits for this
    // one either way); the caller awaits `work` for the real result.
    sendQueueRef.current = work.then(
      () => {},
      () => {},
    );
    return work;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
    setInput("");
  }

  // Bare callback references (not inline arrows): the React Compiler
  // lint flags inline arrows that call ref-reading callbacks as props.
  const handlePickStart = useCallback(
    (kind: ChatMessage["kind"]) => {
      if (kind === "games_list") startPreparing("account");
    },
    [startPreparing],
  );
  const handlePicked = useCallback(() => {
    noteAwaiting();
    void refresh();
  }, [noteAwaiting, refresh]);

  const showSlicks = !loading && visibleMessages.length === 0;
  const lastOwnTextId = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      if (m.sender === "player" && m.kind === "text") return m.id;
    }
    return null;
  })();

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col md:h-dvh">
      {/* Header — support identity, Messenger-style */}
      <header className="flex shrink-0 items-center gap-3 border-b border-surface-border bg-navy px-4 py-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold font-display text-[13px] font-extrabold text-text-ongold">
          PV
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-navy bg-success" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[15px] font-extrabold leading-tight text-text-primary">
            Support chat
          </h1>
          <p className="text-xs leading-tight text-text-secondary">
            Online · replies within minutes
          </p>
        </div>
      </header>

      {/* Thread */}
      <div
        ref={threadScrollRef}
        aria-live="polite"
        className="no-scrollbar flex-1 space-y-3 overflow-y-auto bg-near-black px-4 py-4"
      >
        {messages.length >= 500 && !olderExhausted ? (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            className="w-full rounded-full border border-line bg-card-2 py-2 text-xs font-semibold text-text-primary transition hover:text-gold disabled:opacity-40"
          >
            {loadingOlder ? "Loading…" : "Load older messages"}
          </button>
        ) : null}
        {loading ? (
          <p className="mt-10 text-center text-sm text-text-muted">
            Loading your chat…
          </p>
        ) : null}
        {showSlicks ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-base font-bold text-text-primary">
              How can we help?
            </p>
            <p className="mt-1 max-w-[260px] text-sm text-text-secondary">
              Get a game account or make a deposit — tap to start.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => send("I want a game account")}
                className="min-h-[48px] rounded-full bg-gold px-6 text-sm font-bold text-text-ongold transition hover:brightness-110"
              >
                Get a game account
              </button>
              <button
                type="button"
                onClick={() => send("I want to deposit")}
                className="min-h-[48px] rounded-full border border-gold/60 px-6 text-sm font-bold text-gold transition hover:bg-gold/10"
              >
                Deposit
              </button>
            </div>
          </div>
        ) : (
          visibleMessages.map((m) => (
            <MessageView
              key={m.id}
              message={m}
              resolvedCard={
                m.kind === "account"
                  ? (initialCards[str(m.body["account_id"])] ?? null)
                  : null
              }
              resolvedShotUrl={
                m.kind === "shot"
                  ? (liveEchoShotUrls[m.id] ??
                    initialShotUrls[str(m.body["screenshot_path"])] ??
                    null)
                  : null
              }
              onPickStart={handlePickStart}
              onPicked={handlePicked}
              onDepositSend={sendDeposit}
              receipt={
                m.id === lastOwnTextId
                  ? m.is_read_by_admin
                    ? "seen"
                    : "sent"
                  : undefined
              }
            />
          ))
        )}
        {(agentTyping || awaitingReply || preparing) && !loading ? (
          <div className="flex justify-start" aria-label="Agent is typing">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-[5px] border border-line bg-card-2 px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p role="alert" className="bg-near-black px-4 pb-1 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {/* Send bar */}
      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-surface-border bg-navy px-3 py-2.5"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="chat-input">
            Type a message
          </label>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void sendImage(f);
            }}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            aria-label="Send an image"
            title="Send an image (or paste one)"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-surface-border text-text-secondary transition hover:text-gold disabled:opacity-50"
          >
            <ImageIcon className="h-5 w-5" />
          </button>
          <textarea
            id="chat-input"
            ref={composerRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              broadcastTyping();
            }}
            onPaste={(e) => {
              const file = e.clipboardData?.files?.[0];
              if (file && file.type.startsWith("image/")) {
                e.preventDefault();
                void sendImage(file);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
                setInput("");
              }
            }}
            placeholder="Type a message…"
            autoComplete="off"
            className="max-h-[150px] min-h-[48px] flex-1 resize-none overflow-y-auto rounded-[24px] border border-surface-border bg-surface-input px-4 py-3 text-sm leading-snug text-text-primary placeholder:text-text-muted focus:border-gold/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-text-ongold transition hover:brightness-110 disabled:opacity-50"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
