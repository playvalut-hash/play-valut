"use client";

import { useCallback, useEffect, useRef, useState } from "react";import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  CheckIcon,
  ClockIcon,
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
import {
  chatPick,
  getAccountCard,
  getScreenshotUrl,
  getThread,
  markThreadRead,
  sendChatMessage,
  submitChatDeposit,
} from "../_actions";
import type { AccountCard, ChatMessage } from "../_types";

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

function ShotMessage({ message }: { message: ChatMessage }) {
  const path = str(message.body["screenshot_path"]);
  const caption = str(message.body["caption"]);
  const mine = message.sender === "player";
  const [url, setUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (path) {
      getScreenshotUrl(path).then((u) => {
        if (!cancelled) setUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%]">
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

function AccountCardMessage({ message }: { message: ChatMessage }) {
  const accountId = str(message.body["account_id"]);
  const bodyStatus = message.body["status"] === "active" ? "active" : "creating";
  const [card, setCard] = useState<AccountCard | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (accountId) {
      getAccountCard(accountId).then((c) => {
        if (!cancelled) setCard(c);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [accountId]);

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

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[320px] overflow-hidden rounded-2xl border border-gold/40 bg-surface-card">
        <div className="bg-gradient-to-r from-gold to-gold-light px-4 py-2.5">
          <p className="text-sm font-extrabold text-text-ongold">
            {card?.gameName ?? "Game account"}
          </p>
        </div>
        <div className="space-y-2.5 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Username
            </p>
            <p className="font-mono text-sm font-bold text-text-primary">
              {card?.username ?? "…"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Password
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-sm font-bold text-text-primary">
                {showPassword ? (card?.password ?? "…") : "••••••••"}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="rounded-lg border border-surface-border p-1.5 text-text-secondary transition hover:border-gold/60 hover:text-gold"
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
                  className="rounded-lg border border-surface-border p-1.5 text-text-secondary transition hover:border-gold/60 hover:text-gold"
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
          <div className="flex items-center justify-between border-t border-surface-border pt-3">
            {active ? (
              <span className="flex items-center gap-1 text-xs font-bold text-success">
                <CheckIcon className="h-4 w-4" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-bold text-gold animate-pulse">
                <ClockIcon className="h-4 w-4" />
                Creating…
              </span>
            )}
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
}: {
  message: ChatMessage;
  items: PickItem[];
  title: string;
}) {
  const picked = message.body["picked"] as
    | { id: string; at: string }
    | null
    | undefined;
  const [picking, setPicking] = useState(false);

  async function pick(id: string) {
    if (picked || picking) return;
    setPicking(true);
    try {
      await chatPick(message.id, id);
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[320px] rounded-2xl border border-surface-border bg-surface-card p-3.5">
        <p className="text-sm font-bold text-text-primary">{title}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {items.map((item) => {
            const isPicked = picked?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!!picked || picking}
                onClick={() => pick(item.id)}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  isPicked
                    ? "border-gold bg-gold text-text-ongold"
                    : "border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
                }`}
              >
                {item.brand_color ? (
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.brand_color }}
                  />
                ) : null}
                {item.name}
                {isPicked ? <CheckIcon className="h-3.5 w-3.5" /> : null}
              </button>
            );
          })}
        </div>
        {picked ? (
          <p className="mt-2 text-[11px] text-text-muted">
            Picked {formatTime(picked.at)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── payment card (deposit via chat) ──────────────────────────────────────── */

function PaymentCardMessage({ message }: { message: ChatMessage }) {
  const snapshot = (message.body["snapshot"] ?? {}) as {
    name?: string;
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
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("amount", amount);
      formData.set("methodId", methodId);
      formData.set("screenshot", file);
      const result = await submitChatDeposit(formData);
      if (result.ok) {
        setDone(true);
        setUploadOpen(false);
      } else {
        setError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[320px] rounded-2xl border border-gold/40 bg-surface-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Pay with
        </p>
        <p className="mt-0.5 text-base font-extrabold text-text-primary">
          {snapshot.name ?? "Payment method"}
        </p>
        <div className="mt-2.5 rounded-xl bg-surface-input p-3">
          <p className="font-mono text-sm font-bold text-gold">
            {snapshot.handle ?? ""}
          </p>
          {snapshot.note ? (
            <p className="mt-1.5 text-xs text-text-secondary">{snapshot.note}</p>
          ) : null}
        </div>
        {snapshot.pay_link ? (
          <a
            href={snapshot.pay_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gold text-sm font-bold text-text-ongold transition hover:brightness-110"
          >
            <LinkIcon className="h-4 w-4" />
            Pay
          </a>
        ) : (
          <p className="mt-3 rounded-xl bg-gold/10 px-3 py-2.5 text-xs font-semibold text-gold-light">
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
  );
}

/* ── one message ──────────────────────────────────────────────────────────── */

function MessageView({ message }: { message: ChatMessage }) {
  const mine = message.sender === "player";

  if (message.kind === "shot") return <ShotMessage message={message} />;
  if (message.kind === "account") return <AccountCardMessage message={message} />;
  if (message.kind === "system") {
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
      />
    );
  }
  if (message.kind === "payment_card") {
    return <PaymentCardMessage message={message} />;
  }

  // text
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-[13px] py-[9px] text-[14.5px] leading-[1.45] ${
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
    </div>
  );
}

/* ── the chat screen ──────────────────────────────────────────────────────── */

export default function ChatClient({ playerId }: { playerId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [greeted, setGreeted] = useState(
    () =>
      typeof window !== "undefined" &&
      sessionStorage.getItem("pv_greeted") === "1",
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const thread = await getThread();
    setMessages(thread);
    setLoading(false);
    void markThreadRead();
  }, []);

  useEffect(() => {
    // Initial load: syncing React state with the external chat store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendChatMessage(t, greeted);
      if (!result.ok) {
        setError(result.error);
      } else if (result.greeted) {
        sessionStorage.setItem("pv_greeted", "1");
        setGreeted(true);
      }
      void refresh();
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
    setInput("");
  }

  const showSlicks = !loading && messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-surface-border bg-navy px-4 py-3.5">
        <h1 className="text-base font-extrabold text-text-primary">
          Support chat
        </h1>
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          An agent usually replies within minutes
        </p>
      </header>

      {/* Thread */}
      <div
        aria-live="polite"
        className="no-scrollbar flex-1 space-y-3 overflow-y-auto bg-near-black px-4 py-4"
      >
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
          messages.map((m) => <MessageView key={m.id} message={m} />)
        )}
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
            id="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            autoComplete="off"
            className="min-h-[48px] flex-1 rounded-full border border-surface-border bg-surface-input px-4 text-sm text-text-primary placeholder:text-text-muted focus:border-gold/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
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
