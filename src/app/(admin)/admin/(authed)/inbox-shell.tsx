"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AdminInfo,
  ChatMessageView,
  PlayerDetailView,
  PlayerOverview,
} from "../../_actions";
import {
  getInboxOverview,
  getPlayerDetail,
  getThread,
  markThreadRead,
} from "../../_actions";
import { cn } from "@/lib/utils";
import { mergeThreadMessages } from "@/lib/thread-merge";
import { ChatIcon, ChevronDownIcon, SearchIcon } from "@/components/icons";
import ThreadView from "./thread";
import DetailsPanel from "./details-panel";
import { Avatar, timeAgo } from "./ui-bits";

type Filter = "all" | "unread" | "action" | "active";

function PlayerRow({
  player,
  selected,
  onSelect,
  onPrefetch,
}: {
  player: PlayerOverview;
  selected: boolean;
  onSelect: () => void;
  onPrefetch: () => void;
}) {
  const actionNeeded = player.pendingDeposits > 0 || player.creatingAccounts > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onPrefetch}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "admin-focus admin-lift block w-full border-b border-surface-border/50 px-3 py-2.5 text-left",
        selected ? "bg-gold/10" : "hover:bg-surface-card/60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="relative shrink-0">
          <Avatar name={player.displayName} />
          {player.isOnline && (
            <span
              aria-label="Active now"
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-2 bg-emerald-400"
            />
          )}
        </span>
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
            {player.isOnline && (
              <span className="rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-semibold text-emerald-400">
                Active
              </span>
            )}
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

/* ── Inbox state persistence ──────────────────────────────────────────────
 * Navigating to another admin section and back REMOUNTS this shell, which
 * used to wipe the conversation cache and the open player (live-test find,
 * Build 37). A small sessionStorage snapshot (open player + a few cached
 * threads) is restored on mount and silently revalidated, so coming back
 * to the inbox is instant and keeps your place. */
const INBOX_SNAP_KEY = "pv-inbox-v1";
type InboxSnap = {
  v: 1;
  selectedId: string | null;
  entries: Array<
    [string, { thread: ChatMessageView[]; detail: PlayerDetailView | null }]
  >;
};
function loadInboxSnapshot(): InboxSnap | null {
  try {
    const raw = sessionStorage.getItem(INBOX_SNAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InboxSnap;
    if (parsed.v !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Business Inbox: flexible player list · flexible WhatsApp-style thread ·
 * 336px details panel. Uses Supabase Realtime for instant updates.
 */
export default function InboxShell({
  admin,
  overview: initialOverview,
  selectedId: initialSelectedId,
  thread: initialThread,
  detail: initialDetail,
  games,
  gamesCount,
  methods,
  methodsCount,
  tagOptions,
}: {
  admin: AdminInfo;
  overview: PlayerOverview[];
  selectedId: string | null;
  thread: ChatMessageView[];
  detail: PlayerDetailView | null;
  games: Array<{ id: string; name: string }>;
  gamesCount: number;
  methods: Array<{
    id: string;
    name: string;
    brandColor: string | null;
    accountName: string;
    handle: string;
    note: string | null;
    payLink: string | null;
  }>;
  methodsCount: number;
  tagOptions: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string>("");

  // Snapshot from a previous mount of this shell (section navigation
  // remounts it) — restores the open conversation + cache instantly.
  const [restored] = useState<InboxSnap | null>(loadInboxSnapshot);
  const restoredEntry = (id: string | null) =>
    id ? restored?.entries.find(([k]) => k === id)?.[1] : undefined;

  // Client-side selection: instant, no page reload
  // Overview lives in state so Realtime can update it WITHOUT
  // router.refresh() (a full page re-render per event was a top speed killer).
  const [overview, setOverview] = useState<PlayerOverview[]>(initialOverview);
  // Pagination (v2 Phase 1, audit H2): the list is a window, not the whole
  // base. Search runs server-side; Load more pages through older players.
  const [hasMore, setHasMore] = useState(initialOverview.length >= 100);
  const [loadingMore, setLoadingMore] = useState(false);
  const queryRef = useRef("");
  const overviewRef = useRef<PlayerOverview[]>(initialOverview);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  useEffect(() => {
    overviewRef.current = overview;
  }, [overview]);
  // Desktop details-panel collapse (Build 50) — persisted, same pattern
  // as the sidebar rail in admin-shell.
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("pv-details-collapsed") === "1";
    } catch {
      return false;
    }
  });

  function togglePanel() {
    setPanelCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("pv-details-collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Mouse-drag resize for the details panel (Build 51) — drag its left
  // edge; width persists like the collapse choice. Desktop only.
  const PANEL_MIN_W = 280;
  const PANEL_MAX_W = 560;
  const PANEL_DEFAULT_W = 336;
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const v = Number(window.localStorage.getItem("pv-details-width"));
      return Number.isFinite(v) && v >= PANEL_MIN_W && v <= PANEL_MAX_W
        ? v
        : PANEL_DEFAULT_W;
    } catch {
      return PANEL_DEFAULT_W;
    }
  });
  const panelRef = useRef<HTMLDivElement | null>(null);

  function persistPanelWidth(w: number) {
    try {
      window.localStorage.setItem("pv-details-width", String(Math.round(w)));
    } catch {
      // ignore
    }
  }

  function onPanelDragStart(e: { clientX: number; preventDefault: () => void }) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelRef.current?.offsetWidth ?? panelWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(
        PANEL_MAX_W,
        Math.max(PANEL_MIN_W, startW + (startX - ev.clientX)),
      );
      setPanelWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      const w = panelRef.current?.offsetWidth;
      if (w) persistPanelWidth(w);
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function resetPanelWidth() {
    setPanelWidth(PANEL_DEFAULT_W);
    persistPanelWidth(PANEL_DEFAULT_W);
  }
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialSelectedId ?? restored?.selectedId ?? null,
  );
  const [thread, setThread] = useState<ChatMessageView[]>(() => {
    if (initialThread.length > 0) return initialThread;
    return (
      restoredEntry(initialSelectedId ?? restored?.selectedId ?? null)
        ?.thread ?? initialThread
    );
  });
  // Mirror of the displayed thread for the poll refresh callback, plus
  // whether the user loaded older pages (audit M3 merge gate).
  const threadRef = useRef<ChatMessageView[]>([]);
  const hasOlderRef = useRef(false);
  const [detail, setDetail] = useState<PlayerDetailView | null>(() => {
    if (initialDetail) return initialDetail;
    return (
      restoredEntry(initialSelectedId ?? restored?.selectedId ?? null)
        ?.detail ?? initialDetail
    );
  });
  const [loadingThread, setLoadingThread] = useState(false);
  const selectedIdRef = useRef<string | null>(initialSelectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Conversation cache: reopening a player is INSTANT (stale-while-revalidate).
  // Stable Map held in state (never re-set), seeded with the server-loaded
  // conversation so the initially open player reopens instantly too.
  const [cache] = useState(() => {
    const m = new Map<
      string,
      { thread: ChatMessageView[]; detail: PlayerDetailView | null }
    >();
    if (restored) {
      for (const [id, entry] of restored.entries) m.set(id, entry);
    }
    if (initialSelectedId) {
      m.set(initialSelectedId, { thread: initialThread, detail: initialDetail });
    }
    return m;
  });

  // Silent refetch of the open conversation — actions (approve, send, tags…)
  // call this instead of router.refresh() so updates appear INSTANTLY
  // without a manual page refresh.
  // An OPEN conversation is a READ conversation (Build 48): clear the
  // player's unread badge in the list instantly, don't wait for the
  // overview refetch / realtime cycle to catch up.
  const clearUnreadLocal = useCallback((id: string) => {
    setOverview((prev) =>
      prev.map((p) => (p.id === id && p.unreadCount !== 0 ? { ...p, unreadCount: 0 } : p)),
    );
  }, []);

  /* ── Optimistic UI (instant sends / tags / creating accounts) ─────────
   * Server actions take seconds on a cold start, and the user saw NOTHING
   * until the round trip finished. So sends append a local echo instantly,
   * tags patch the detail instantly, and a creating account shows a
   * placeholder row instantly. Server truth always wins on refresh:
   * echoes whose real message arrived are pruned below, and detail
   * patches are overwritten by the refetched detail. Failures revert
   * (the caller drops its echo / re-patches the snapshot). */
  const [optimisticMsgs, setOptimisticMsgs] = useState<ChatMessageView[]>([]);
  const appendOptimistic = useCallback((msg: ChatMessageView) => {
    setOptimisticMsgs((prev) => [...prev, msg]);
  }, []);
  const dropOptimistic = useCallback((id: string) => {
    setOptimisticMsgs((prev) => prev.filter((m) => m.id !== id));
  }, []);
  /* Optimistic clear: the thread blanks the instant the admin confirms
     — even though the server delete (rows + storage objects) takes
     seconds. The cache entry is filtered too, so reopening the player
     cannot resurrect cleared rows while the delete is still running.
     On failure the caller refetches (server truth restores the view;
     in-flight echoes reappear when their own sends land). */
  const clearThreadOptimistic = useCallback(
    (playerId: string, olderThanDays?: number) => {
      const cutoff =
        olderThanDays === undefined
          ? null
          : Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      // Scoped clear keeps the recent days; full clear keeps nothing.
      const keep = (m: ChatMessageView) =>
        cutoff !== null && Date.parse(m.createdAt) >= cutoff;
      const entry = cache.get(playerId);
      if (entry) {
        cache.set(playerId, {
          thread: entry.thread.filter(keep),
          detail: entry.detail,
        });
      }
      if (selectedIdRef.current === playerId) {
        const next = threadRef.current.filter(keep);
        threadRef.current = next;
        setThread(next);
        if (cutoff === null) hasOlderRef.current = false;
      }
      setOptimisticMsgs((prev) =>
        prev.filter((m) => m.playerId !== playerId || keep(m)),
      );
    },
    [cache],
  );
  const patchDetailOptimistic = useCallback(
    (
      playerId: string,
      patch: { tags?: string[]; accounts?: PlayerDetailView["accounts"] },
    ) => {
      if (selectedIdRef.current !== playerId) return;
      setDetail((prev) =>
        prev && prev.player.id === playerId ? { ...prev, ...patch } : prev,
      );
      if (patch.tags) {
        const tags = patch.tags;
        setOverview((prev) =>
          prev.map((p) => (p.id === playerId ? { ...p, tags } : p)),
        );
      }
    },
    [],
  );

  const refreshSeqRef = useRef(0);
  const refreshSelected = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    const seq = ++refreshSeqRef.current;
    try {
      const [t, d] = await Promise.all([getThread(id), getPlayerDetail(id)]);
      // A newer refresh started while this one was in flight — it owns
      // the view now; dropping this stale result (Build 54).
      if (seq !== refreshSeqRef.current) return;
      // Merge keeps user-loaded older pages across polls (audit M3); a
      // short window means the full history fits, so stale older pages
      // drop and pagination resets. The cache keeps the fresh window.
      const merged = hasOlderRef.current
        ? mergeThreadMessages(threadRef.current, t, 500, (m) => m.createdAt)
        : t;
      if (t.length < 500) hasOlderRef.current = false;
      cache.set(id, { thread: t, detail: d });
      // Prune confirmed echoes: a local echo whose real message is in
      // this fresh thread drops out (the real one renders instead). A
      // superseded refresh returns early above, so it never drops a
      // live echo — the winning refresh prunes it instead.
      setOptimisticMsgs((prev) =>
        prev.filter(
          (e) =>
            e.playerId !== id ||
            !t.some(
              (m) =>
                m.sender === e.sender &&
                m.kind === e.kind &&
                (m.text ?? null) === (e.text ?? null) &&
                Date.parse(m.createdAt) >= Date.parse(e.createdAt) - 10000,
            ),
        ),
      );
      if (selectedIdRef.current === id) {
        threadRef.current = merged;
        setThread(merged);
        setDetail(d);
        // The admin is looking at this thread: anything in it — including
        // messages that arrived while it was open — counts as read.
        markThreadRead(admin.id, id).catch(() => {});
        clearUnreadLocal(id);
      }
    } catch {
      // keep current view on transient errors
    }
  }, [cache, admin.id, clearUnreadLocal]);

  // Persist a compact snapshot whenever the open conversation changes,
  // so a remount (section navigation and back) restores it instantly.
  useEffect(() => {
    try {
      const entries = [...cache.entries()]
        .slice(-6)
        .map(
          ([id, v]) =>
            [
              id,
              { thread: v.thread.slice(-150), detail: v.detail },
            ] as InboxSnap["entries"][number],
        );
      const snap: InboxSnap = { v: 1, selectedId, entries };
      sessionStorage.setItem(INBOX_SNAP_KEY, JSON.stringify(snap));
    } catch {
      // storage full / unavailable — persistence is best-effort
    }
  }, [cache, selectedId, thread, detail]);

  // If this mount restored a conversation the server did not load, silently
  // revalidate it once so the restored view is also fresh.
  const restoredOnceRef = useRef(false);
  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    if (!initialSelectedId && restored?.selectedId) {
      void refreshSelected();
    }
  }, [initialSelectedId, restored, refreshSelected]);

  // Background prefetch — THREAD ONLY, after a 200ms hover pause, one
  // pending slot (sweeping the mouse across rows no longer fires a query
  // storm). Detail loads on click; touch devices skip prefetch entirely.
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchPlayer = useCallback(
    (id: string) => {
      if (cache.has(id)) return;
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = setTimeout(() => {
        prefetchTimerRef.current = null;
        if (cache.has(id)) return;
        void (async () => {
          try {
            const t = await getThread(id);
            if (!cache.has(id)) cache.set(id, { thread: t, detail: null });
          } catch {
            // prefetch is best-effort
          }
        })();
      }, 200);
    },
    [cache],
  );

  async function selectPlayer(id: string | null) {
    if (id === selectedId) {
      setSelectedId(null);
      setThread([]);
      threadRef.current = [];
      hasOlderRef.current = false;
      setDetail(null);
      return;
    }
    setSelectedId(id);
    setMobilePanel(null);
    if (!id) {
      setThread([]);
      threadRef.current = [];
      hasOlderRef.current = false;
      setDetail(null);
      return;
    }
    // Cache hit → show instantly, refresh silently in the background.
    const cached = cache.get(id);
    if (cached) {
      setThread(cached.thread);
      threadRef.current = cached.thread;
      hasOlderRef.current = false;
      setDetail(cached.detail);
      setLoadingThread(false);
      clearUnreadLocal(id);
      void refreshSelected();
      markThreadRead(admin.id, id).catch(() => {});
      return;
    }
    // Cache miss → thread FIRST (chat appears ASAP), detail right after.
    setThread([]);
    setDetail(null);
    setLoadingThread(true);
    try {
      const t = await getThread(id);
      if (selectedIdRef.current !== id) return;
      setThread(t);
      threadRef.current = t;
      hasOlderRef.current = false;
      setLoadingThread(false);
      clearUnreadLocal(id);
      markThreadRead(admin.id, id).catch(() => {});
      const d = await getPlayerDetail(id);
      cache.set(id, { thread: t, detail: d });
      if (selectedIdRef.current === id) setDetail(d);
    } catch {
      setLoadingThread(false);
    }
  }

  // Realtime: TARGETED updates only — no router.refresh() storms.
  // - Event for the OPEN player  -> refresh that thread (250ms coalesce).
  // - Any event                  -> refresh the overview list (1.5s coalesce).
  // - A slow 30s safety poll covers anything Realtime might miss.
  const overviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshOverview = useCallback(async () => {
    try {
      const q = queryRef.current.trim();
      const limit = Math.max(100, overviewRef.current.length);
      const rows = await getInboxOverview({
        search: q || undefined,
        limit,
      });
      setOverview(rows);
      setHasMore(rows.length >= limit);
    } catch {
      // keep current list on transient errors
    }
  }, []);

  const scheduleOverview = useCallback(() => {
    if (overviewTimerRef.current) return;
    overviewTimerRef.current = setTimeout(() => {
      overviewTimerRef.current = null;
      void refreshOverview();
    }, 1500);
  }, [refreshOverview]);

  const scheduleSelected = useCallback(() => {
    if (selectedTimerRef.current) return;
    selectedTimerRef.current = setTimeout(() => {
      selectedTimerRef.current = null;
      void refreshSelected();
    }, 250);
  }, [refreshSelected]);

  useEffect(() => {
    let channel: { unsubscribe: () => void } | null = null;

    async function setup() {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const onEvent = (table: string) => (payload: { new?: unknown; old?: unknown }) => {
          if (document.hidden) return;
          const rec = (payload.new ?? payload.old) as
            | { player_id?: string }
            | undefined;
          if (rec?.player_id && rec.player_id === selectedIdRef.current) {
            scheduleSelected();
          }
          scheduleOverview();
          void table; // (handler factory arg, kept for clarity)
        };
        channel = supabase
          .channel("admin-inbox")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "chat_messages" },
            onEvent("chat_messages"),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "deposits" },
            onEvent("deposits"),
          )
          .subscribe() as unknown as { unsubscribe: () => void };
      } catch {
        // realtime unavailable — the safety poll below still runs
      }
    }
    void setup();
    const poll = setInterval(() => {
      if (!document.hidden) {
        void refreshOverview();
        void refreshSelected();
      }
    }, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshOverview();
        void refreshSelected();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      channel?.unsubscribe();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshSelected, refreshOverview, scheduleOverview, scheduleSelected]);

  // Server-side search (audit H2): typing searches the whole player base,
  // not just the loaded window. Clearing the search restores the default
  // newest-first window. A sequence guard drops stale responses.
  const searchSeqRef = useRef(0);
  const firstQueryRef = useRef(true);
  useEffect(() => {
    if (firstQueryRef.current) {
      firstQueryRef.current = false;
      return;
    }
    const q = query.trim();
    const seq = ++searchSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const rows = await getInboxOverview({
          search: q || undefined,
          limit: 100,
        });
        if (seq !== searchSeqRef.current) return;
        setOverview(rows);
        setHasMore(rows.length >= 100);
      } catch {
        // keep current list on transient errors
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const q = queryRef.current.trim();
      const rows = await getInboxOverview({
        search: q || undefined,
        limit: 100,
        offset: overviewRef.current.length,
      });
      setOverview((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((p) => !seen.has(p.id))];
      });
      setHasMore(rows.length >= 100);
    } catch {
      // keep current list on transient errors
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

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
      if (filter === "active" && !p.isOnline) return false;
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
  const activeCount = overview.filter((p) => p.isOnline).length;
  const [mobilePanel, setMobilePanel] = useState<"details" | null>(null);
  // Mobile shows: list (no selection) → thread (selection) → details (if requested)
  const mobileView = !selectedId ? "list" : mobilePanel === "details" ? "details" : "thread";

  return (
    <div className="flex h-full min-h-0">
      {/* Player list — full width on mobile, flexible on desktop: it
          grows and shrinks with the window (and the zoom level) instead
          of sitting at a fixed 264px. */}
      <div
        className={cn(
          "flex shrink-0 flex-col border-r border-line bg-bg-2",
          "w-full md:w-[clamp(220px,20vw,320px)]",
          // Hide on mobile when thread/details is shown
          selectedId && mobileView !== "list" ? "hidden md:flex" : "flex",
        )}
      >
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
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Message filters">
            {(
              [
                ["all", "All"],
                ["unread", unreadTotal > 0 ? `Unread (${unreadTotal})` : "Unread"],
                ["action", "Action-needed"],
                ["active", activeCount > 0 ? `Active (${activeCount})` : "Active"],
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
              {overview.length === 0
                ? query.trim()
                  ? "No players match this search."
                  : "No players yet."
                : "No players match this filter."}
            </p>
          ) : (
            filtered.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                selected={p.id === selectedId}
                onPrefetch={() => prefetchPlayer(p.id)}
                onSelect={() => {
                  void selectPlayer(p.id === selectedId ? null : p.id);
                }}
              />
            ))
          )}
          {hasMore && (
            <div className="border-b border-surface-border/50 px-3 py-2">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="admin-focus w-full rounded-md border border-surface-border bg-surface-card py-2 text-xs font-semibold text-text-primary transition hover:text-gold disabled:opacity-40"
              >
                {loadingMore ? "Loading…" : "Load more players"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Thread — full width on mobile, flex on desktop */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-near-black",
          // Hide on mobile when list is shown and no selection
          !selectedId ? "hidden md:flex" : mobileView === "thread" ? "flex" : "hidden md:flex",
        )}
      >
        {selected ? (
          <>
            {loadingThread ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                  <p className="text-sm text-text-muted">Loading conversation…</p>
                </div>
              </div>
            ) : (
              <ThreadView
                admin={admin}
                player={selected}
                thread={[
                  ...thread,
                  ...optimisticMsgs.filter((m) => m.playerId === selectedId),
                ]}
                games={games}
                gamesCount={gamesCount}
                methods={methods}
                methodsCount={methodsCount}
                onMutated={refreshSelected}
                onAppendOptimistic={appendOptimistic}
                onDropOptimistic={dropOptimistic}
                onPrependOlder={(older) => {
                  const existing = new Set(threadRef.current.map((m) => m.id));
                  const fresh = older.filter((m) => !existing.has(m.id));
                  const merged = [...fresh, ...threadRef.current];
                  threadRef.current = merged;
                  setThread(merged);
                  hasOlderRef.current = true;
                }}
                onBack={() => {
                  void selectPlayer(null);
                }}
                onShowDetails={() => setMobilePanel("details")}
                panelCollapsed={panelCollapsed}
                onTogglePanel={togglePanel}
              />
            )}
          </>
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

      {/* Details panel — full width on mobile, 336px on desktop.
          Must stay flex-col at ALL sizes so the inner min-h-0 flex-1 chain
          gives DetailsPanel a bounded height and its own scroll works.
          Small-window responsive fix: below xl (1280px) the panel is a
          fixed overlay drawer instead of a third column — a persisted
          wide panel used to squeeze the thread (and its composer) into
          a narrow strip on small windows. The backdrop closes it. */}
      {selected && detail && !panelCollapsed && mobileView !== "details" && (
        <button
          type="button"
          aria-label="Close details panel"
          onClick={togglePanel}
          className="fixed inset-0 z-40 hidden bg-black/60 md:block xl:hidden"
        />
      )}
      {selected && detail && (
        <div
          ref={panelRef}
          style={{ "--pv-pw": `${panelWidth}px` } as React.CSSProperties}
          className={cn(
            "relative shrink-0 border-l border-surface-border",
            "w-full md:w-[var(--pv-pw,336px)]",
            mobileView === "details"
              ? "flex flex-col"
              : panelCollapsed
                ? "hidden"
                : "hidden md:flex md:flex-col max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-50 max-xl:shadow-2xl",
          )}
        >
          {/* Drag handle — mouse resize (wide desktop only; the panel is
              an overlay below xl, so there is no column edge to drag). */}
          <div
            role="separator"
            aria-label="Resize details panel"
            title="Drag to resize · double-click to reset"
            onMouseDown={onPanelDragStart}
            onDoubleClick={resetPanelWidth}
            className="absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize rounded-full transition-colors hover:bg-gold/30 active:bg-gold/50 xl:block"
          />
          {/* Mobile back button */}
          <div className="flex shrink-0 items-center gap-2 border-b border-surface-border bg-navy px-2 py-1.5 md:hidden">
            <button
              type="button"
              onClick={() => setMobilePanel(null)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gold"
            >
              ← Chat
            </button>
            <span className="flex-1 text-center text-sm font-semibold text-text-primary">
              Player details
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <DetailsPanel
              key={detail.player.id}
              admin={admin}
              detail={detail}
              games={games}
              onMutated={refreshSelected}
              onAppendOptimistic={appendOptimistic}
              onDropOptimistic={dropOptimistic}
              onClearOptimistic={clearThreadOptimistic}
              onDetailPatch={patchDetailOptimistic}
            />
          </div>
        </div>
      )}
    </div>
  );
}
