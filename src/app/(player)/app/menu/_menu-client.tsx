"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BellIcon,
  ChatIcon,
  ChevronDownIcon,
  GamepadIcon,
  LogoutIcon,
  SendIcon,
} from "@/components/icons";
import { maskEmail } from "@/lib/email";
import { markUpdatesRead, signOut } from "../_actions";
import type { PlayerUpdate } from "./page";

interface PlayerProfile {
  display_name: string;
  email: string | null;
  avatar_url: string | null;
}

const SUPPORT_TEXT = encodeURIComponent(
  "Hi, I need help with my game account.",
);
const WHATSAPP_URL = `https://wa.me/?text=${SUPPORT_TEXT}`;
const TELEGRAM_URL = `https://t.me/share/url?url=&text=${SUPPORT_TEXT}`;

function ToneDot({ tone }: { tone: PlayerUpdate["tone"] }) {
  const color =
    tone === "success"
      ? "bg-success"
      : tone === "danger"
        ? "bg-danger"
        : "bg-gold";
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

export default function MenuClient({
  profile,
  updates,
}: {
  profile: PlayerProfile;
  updates: PlayerUpdate[];
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Opening the section reads everything visible: the server records
  // the watermark and the list clears. On failure the items stay, so
  // a failed mark-as-read never silently eats a notification.
  const [dismissed, setDismissed] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  useEffect(() => {
    if (!notificationsOpen || dismissed || updates.length === 0) return;
    let cancelled = false;
    markUpdatesRead()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDismissed(true);
        else setReadError(res.error);
      })
      .catch(() => {
        if (!cancelled) {
          setReadError("Could not mark notifications as read");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [notificationsOpen, dismissed, updates.length]);
  const visible = dismissed ? [] : updates;
  const initial = (profile.display_name.slice(0, 1) || "P").toUpperCase();

  return (
    <div className="px-4 pt-5">
      {/* Profile */}
      <div className="flex items-center gap-4 rounded-2xl border border-surface-border bg-surface-card p-5">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/20 text-2xl font-extrabold text-gold"
          >
            {initial}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-text-primary">
            {profile.display_name}
          </p>
          {profile.email ? (
            <p className="truncate text-sm text-text-secondary">
              {maskEmail(profile.email)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Rows */}
      <nav aria-label="Menu" className="mt-4 space-y-2.5 pb-6">
        <Link
          href="/app/accounts"
          className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-card px-4 py-4 transition hover:border-gold/60"
        >
          <GamepadIcon className="h-5 w-5 shrink-0 text-gold" />
          <span className="flex-1 text-sm font-bold text-text-primary">
            My Game Accounts
          </span>
        </Link>

        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <button
            type="button"
            onClick={() => setNotificationsOpen((v) => !v)}
            aria-expanded={notificationsOpen}
            className="flex w-full items-center gap-3 px-4 py-4 transition hover:border-gold/60"
          >
            <BellIcon className="h-5 w-5 shrink-0 text-gold" />
            <span className="flex-1 text-left text-sm font-bold text-text-primary">
              Notifications
            </span>
            {visible.length > 0 ? (
              <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-extrabold text-black">
                {visible.length}
              </span>
            ) : null}
            <ChevronDownIcon
              className={`h-5 w-5 text-text-muted transition-transform ${
                notificationsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {notificationsOpen ? (
            <div className="border-t border-surface-border px-4 py-2">
              {readError ? (
                <p role="alert" className="py-2 text-xs text-danger">
                  {readError}
                </p>
              ) : null}
              {visible.length === 0 ? (
                <p className="py-3 text-center text-sm text-text-secondary">
                  No updates yet. Deposit decisions and new accounts will show
                  up here.
                </p>
              ) : (
                <ul className="divide-y divide-surface-border">
                  {visible.map((u) => (
                    <li key={u.id}>
                      {/* A tap on an update goes where it belongs (deposit
                          → Wallet history, account → My Game Accounts);
                          opening the section still dismisses it. */}
                      <Link
                        href={u.href}
                        className="flex items-start gap-2.5 py-3 transition hover:opacity-80"
                      >
                        <span className="mt-1.5">
                          <ToneDot tone={u.tone} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-text-primary">
                            {u.title}
                          </p>
                          <p className="text-xs text-text-secondary">{u.detail}</p>
                          <p className="mt-0.5 text-[11px] text-text-muted">
                            {new Date(u.at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <Link
          href="/app/chat"
          className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-card px-4 py-4 transition hover:border-gold/60"
        >
          <ChatIcon className="h-5 w-5 shrink-0 text-gold" />
          <span className="flex-1 text-sm font-bold text-text-primary">
            Chat with support
          </span>
        </Link>

        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 text-sm font-bold text-success transition hover:bg-success/15"
          >
            <ChatIcon className="h-4 w-4" />
            WhatsApp
          </a>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-card text-sm font-bold text-text-primary transition hover:border-gold/60"
          >
            <SendIcon className="h-4 w-4" />
            Telegram
          </a>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-4 text-sm font-bold text-danger transition hover:bg-danger/15"
          >
            <LogoutIcon className="h-5 w-5 shrink-0" />
            Log out
          </button>
        </form>
      </nav>
    </div>
  );
}
