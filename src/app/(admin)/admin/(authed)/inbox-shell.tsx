"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  AdminInfo,
  ChatMessageView,
  PlayerDetailView,
  PlayerOverview,
} from "../../_actions";
import { cn } from "@/lib/utils";
import { ChatIcon, ChevronDownIcon, SearchIcon } from "@/components/icons";
import ThreadView from "./thread";
import DetailsPanel from "./details-panel";
import { Avatar, timeAgo } from "./ui-bits";

type Filter = "all" | "unread" | "action";

function PlayerRow({
  player,
  selected,
  onSelect,
}: {
  player: PlayerOverview;
  selected: boolean;
  onSelect: () => void;
}) {
  const actionNeeded = player.pendingDeposits > 0 || player.creatingAccounts > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "admin-focus admin-lift block w-full border-b border-surface-border/50 px-3 py-2.5 text-left",
        selected ? "bg-gold/10" : "hover:bg-surface-card/60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={player.displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-medium text-text-primary">
              {player.displayName}
            </p>
            <span className="shrink-0 text-[10px] text-text-muted">
              {timeAgo(player.lastMessageAt)}
            </span>
          </div>
          <p className="truncate text-[11px] text-text-secondary">
            {player.lastPreview ?? "No messages yet"}
          </p>
          <div className="mt-1 flex items-center gap-1">
            {player.unreadCount > 0 && (
              <span className="rounded-full bg-gold px-1.5 py-px text-[10px] font-bold text-navy">
                {player.unreadCount}
              </span>
            )}
            {actionNeeded && (
              <span className="rounded-full bg-gold/15 px-1.5 py-px text-[10px] font-semibold text-gold">
                Action needed
              </span>
            )}
            {player.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="truncate rounded-full bg-surface-elevated px-1.5 py-px text-[10px] text-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

const POLL_MS = 8000;

/**
 * Business Inbox: 320px player list · flexible WhatsApp-style thread ·
 * 336px details panel. Polls (router.refresh) for realtime-ish updates —
 * swap for a Realtime channel once Phase 2 lands.
 */
export default function InboxShell({
  admin,
  overview,
  selectedId,
  thread,
  detail,
  gamesCount,
  methodsCount,
  tagOptions,
}: {
  admin: AdminInfo;
  overview: PlayerOverview[];
  selectedId: string | null;
  thread: ChatMessageView[];
  detail: PlayerDetailView | null;
  gamesCount: number;
  methodsCount: number;
  tagOptions: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string>("");

  // Poll for new messages / deposits / notifications while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overview.filter((p) => {
      if (filter === "unread" && p.unreadCount === 0) return false;
      if (
        filter === "action" &&
        p.pendingDeposits === 0 &&
        p.creatingAccounts === 0
      )
        return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (
        q &&
        !p.displayName.toLowerCase().includes(q) &&
        !(p.email ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [overview, query, filter, tag]);

  const selected = selectedId
    ? (overview.find((p) => p.id === selectedId) ?? null)
    : null;

  const unreadTotal = overview.reduce((n, p) => n + p.unreadCount, 0);

  return (
    <div className="flex h-full min-h-0">
      {/* Player list — fixed 320px */}
      <div className="flex w-80 shrink-0 flex-col border-r border-surface-border bg-navy">
        <div className="shrink-0 border-b border-surface-border p-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players…"
              aria-label="Search players"
              className="admin-focus w-full rounded-md border border-surface-border bg-surface-input py-2 pl-8 pr-2 text-[13px] text-text-primary placeholder:text-text-muted"
            />
          </div>
          <div className="mt-2 flex gap-1.5" role="group" aria-label="Message filters">
            {(
              [
                ["all", "All"],
                ["unread", unreadTotal > 0 ? `Unread (${unreadTotal})` : "Unread"],
                ["action", "Action-needed"],
              ] as Array<[Filter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "admin-focus rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  filter === key
                    ? "bg-gold text-navy"
                    : "bg-surface-card text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative mt-2">
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              aria-label="Filter by tag"
              className="admin-focus w-full appearance-none rounded-md border border-surface-border bg-surface-input px-2 py-1.5 pr-7 text-xs text-text-secondary"
            >
              <option value="">All tags</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          </div>
        </div>
        <div className="admin-thin-scroll min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Players">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-text-muted">
              {overview.length === 0 ? "No players yet." : "No players match this filter."}
            </p>
          ) : (
            filtered.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                selected={p.id === selectedId}
                onSelect={() => {
                  router.push(p.id === selectedId ? "/admin" : `/admin?player=${p.id}`);
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col bg-near-black">
        {selected ? (
          <ThreadView
            admin={admin}
            player={selected}
            thread={thread}
            gamesCount={gamesCount}
            methodsCount={methodsCount}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-card text-text-muted">
              <ChatIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-text-primary">Select a player</p>
              <p className="mt-1 text-xs text-text-muted">
                Pick a conversation from the list to start helping.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Details panel — fixed 336px */}
      {selected && detail && (
        <div className="w-[336px] shrink-0 border-l border-surface-border">
          <DetailsPanel admin={admin} detail={detail} />
        </div>
      )}
    </div>
  );
}
