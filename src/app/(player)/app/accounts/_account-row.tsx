"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
} from "@/components/icons";
import { getAccountCard } from "../_actions";
import { gameGradient } from "../_types";
import type { GameAccount } from "../_types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * One account row: game, username, masked password with show/copy,
 * Creating…/Active chip, Play button on Active. No bonus lines (R4).
 */
export default function AccountRow({ account }: { account: GameAccount }) {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState<"username" | "password" | null>(null);

  const gameName = account.game?.name ?? account.game_id;
  const [c1, c2] = gameGradient(account.game_id);
  const active = account.status === "active";

  // Play goes straight to the game's official link (same rule as the
  // detail page's Smart Play buttons): the app link first when access
  // allows it, else the web link. Only safe http(s) URLs become anchors;
  // without any official link it falls back to the in-app detail page.
  const gameLink = account.game;
  const isHttp = (u: string | null | undefined): u is string =>
    !!u && /^https?:\/\//.test(u);
  const appHref =
    gameLink &&
    (gameLink.access === "both" || gameLink.access === "app") &&
    isHttp(gameLink.link)
      ? gameLink.link
      : null;
  const webHref =
    gameLink &&
    (gameLink.access === "both" || gameLink.access === "web") &&
    isHttp(gameLink.web_link)
      ? gameLink.web_link
      : null;
  const playHref = appHref ?? webHref ?? `/app/game/${account.game_id}`;
  const playExternal = playHref !== `/app/game/${account.game_id}`;

  useEffect(() => {
    let cancelled = false;
    if (showPassword && password === null) {
      getAccountCard(account.id).then((card) => {
        if (!cancelled) setPassword(card?.password ?? "");
      });
    }
    return () => {
      cancelled = true;
    };
  }, [showPassword, password, account.id]);

  async function copy(kind: "username" | "password", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard unavailable — ignore.
    }
  }

  async function copyPassword() {
    if (password === null) {
      const card = await getAccountCard(account.id);
      if (!card) return;
      setPassword(card.password);
      copy("password", card.password);
    } else {
      copy("password", password);
    }
  }

  return (
    <article className="tilt-3d rounded-2xl border border-surface-border bg-surface-card p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          {initials(gameName)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-text-primary">
            {gameName}
          </h2>
          <p className="text-xs text-text-muted">
            {new Date(account.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        {active ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
            <CheckIcon className="h-3 w-3" />
            Active
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-gold animate-pulse">
            <ClockIcon className="h-3 w-3" />
            Creating…
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2 rounded-xl bg-surface-input p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Username
            </p>
            <p className="truncate font-mono text-sm font-semibold text-text-primary">
              {account.username}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copy("username", account.username)}
            aria-label="Copy username"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-gold/60 hover:text-gold min-h-[36px]"
          >
            {copied === "username" ? (
              <CheckIcon className="h-4 w-4 text-success" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
            {copied === "username" ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-surface-border pt-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Password
            </p>
            <p className="font-mono text-sm font-semibold text-text-primary">
              {showPassword ? (password ?? "…") : "••••••••"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="flex min-h-[36px] items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-gold/60 hover:text-gold"
            >
              {showPassword ? (
                <EyeOffIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
              {showPassword ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              onClick={copyPassword}
              aria-label="Copy password"
              className="flex min-h-[36px] items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-gold/60 hover:text-gold"
            >
              {copied === "password" ? (
                <CheckIcon className="h-4 w-4 text-success" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
              {copied === "password" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {active ? (
        playExternal ? (
          <a
            href={playHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gold text-sm font-bold text-black transition hover:brightness-110"
          >
            Play {gameName}
            <ArrowRightIcon className="h-4 w-4" />
          </a>
        ) : (
          <Link
            href={playHref}
            className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gold text-sm font-bold text-black transition hover:brightness-110"
          >
            Play {gameName}
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        )
      ) : (
        <p className="mt-3 rounded-xl bg-gold/10 px-3 py-2.5 text-center text-xs font-semibold text-gold-light">
          Support is setting up your login — it will appear here and in chat.
        </p>
      )}
    </article>
  );
}
