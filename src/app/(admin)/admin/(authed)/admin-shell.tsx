"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, XIcon } from "@/components/icons";
import type { AdminInfo, NotificationView } from "../../_actions";
import { getNotifications, getUnreadNotificationCount } from "../../_actions";
import { AdminProvider } from "./admin-context";
import SideNav from "./side-nav";
import TopBar from "./top-bar";
import { cn } from "@/lib/utils";

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function PanelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
    </svg>
  );
}

// First page of the bell: newest 30 unread + exact unread count. Shared by
// the mount effect and the poll/open refresh so the two stay identical.
async function fetchFirstNotificationPage() {
  const [rows, count] = await Promise.all([
    getNotifications({ limit: 30 }),
    getUnreadNotificationCount(),
  ]);
  return { rows, count };
}

export default function AdminShell({
  session,
  children,
}: {
  session: AdminInfo;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Notifications (v2 Phase 1, audit H3): the bell was hardcoded empty —
  // no loader existed at all. It now fetches on mount, polls every 30s,
  // and pages through older alerts instead of capping at 30.
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifHasMore, setNotifHasMore] = useState(false);
  const [notifLoadingMore, setNotifLoadingMore] = useState(false);

  const refreshNotifications = useCallback(async () => {
    try {
      const { rows, count } = await fetchFirstNotificationPage();
      setNotifications(rows);
      setUnreadCount(count);
      setNotifHasMore(rows.length >= 30);
    } catch {
      // keep current bell state on transient errors
    }
  }, []);

  const loadMoreNotifications = useCallback(async () => {
    if (notifLoadingMore || !notifHasMore) return;
    setNotifLoadingMore(true);
    try {
      const rows = await getNotifications({
        limit: 30,
        offset: notifications.length,
      });
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...rows.filter((n) => !seen.has(n.id))];
      });
      setNotifHasMore(rows.length >= 30);
    } catch {
      // keep current list on transient errors
    } finally {
      setNotifLoadingMore(false);
    }
  }, [notifLoadingMore, notifHasMore, notifications.length]);

  const handleNotificationOpened = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const handleNotificationsCleared = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    setNotifHasMore(false);
  }, []);

  // Initial load lives in the effect as an inner async function (the
  // standard fetch-then-set pattern) so the compiler lint accepts it;
  // refreshNotifications above stays the single handler for poll/open.
  useEffect(() => {
    let cancelled = false;
    async function initial() {
      try {
        const { rows, count } = await fetchFirstNotificationPage();
        if (cancelled) return;
        setNotifications(rows);
        setUnreadCount(count);
        setNotifHasMore(rows.length >= 30);
      } catch {
        // keep empty bell on transient errors
      }
    }
    void initial();
    const iv = setInterval(() => void refreshNotifications(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [refreshNotifications]);
  // Desktop: collapsible icon rail (persisted). Mobile keeps the drawer.
  // Lazy init (same pattern as the inbox snapshot) — no effect needed.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("pv-admin-collapsed") === "1";
    } catch {
      return false;
    }
  });

  // Top bar minimize (Build 52) — default OPEN; hiding it gives the
  // inbox/chat the full height. Choice persists like the other prefs.
  const [topBarHidden, setTopBarHidden] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("pv-topbar-hidden") === "1";
    } catch {
      return false;
    }
  });

  function toggleTopBar() {
    setTopBarHidden((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("pv-topbar-hidden", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("pv-admin-collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Listen for sidebar open requests from mobile inbox
  useEffect(() => {
    const handler = () => setSidebarOpen(true);
    window.addEventListener("open-admin-sidebar", handler);
    return () => window.removeEventListener("open-admin-sidebar", handler);
  }, []);

  return (
    <AdminProvider value={session}>
      <div className="flex h-dvh flex-col overflow-hidden bg-near-black">
        {topBarHidden ? (
          /* Pull-tab: hangs at the top edge, right above the inbox —
             takes zero layout space; click to bring the bar back. */
          <div className="relative z-30 h-0">
            <button
              type="button"
              onClick={toggleTopBar}
              aria-label="Show top bar"
              title="Show top bar"
              className="admin-focus absolute left-1/2 top-0 flex h-5 -translate-x-1/2 items-center rounded-b-xl border border-t-0 border-gold/50 bg-navy px-4 text-gold shadow-lg shadow-black/40 transition hover:bg-surface-elevated"
            >
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
        <div className="flex items-center gap-2">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="ml-2 rounded-lg p-2 text-text-secondary hover:text-gold md:hidden"
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          >
            {sidebarOpen ? <XIcon className="h-5 w-5" /> : <HamburgerIcon className="h-5 w-5" />}
          </button>
          {/* Desktop sidebar collapse toggle */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="ml-2 hidden rounded-lg p-2 text-text-secondary transition hover:text-gold md:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <TopBar
              admin={session}
              notifications={notifications}
              unreadCount={unreadCount}
              hasMoreNotifications={notifHasMore}
              loadingMoreNotifications={notifLoadingMore}
              onLoadMoreNotifications={() => void loadMoreNotifications()}
              onNotificationsOpen={() => void refreshNotifications()}
              onNotificationOpened={handleNotificationOpened}
              onNotificationsCleared={handleNotificationsCleared}
            />
          </div>
          {/* Minimize the top bar — more room for the inbox */}
          <button
            type="button"
            onClick={toggleTopBar}
            className="mr-2 shrink-0 rounded-lg p-2 text-text-secondary transition hover:text-gold"
            aria-label="Hide top bar"
            title="Hide top bar (more room for the inbox)"
          >
            <ChevronDownIcon className="h-4 w-4 rotate-180" />
          </button>
        </div>
        )}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar — hidden on mobile unless open */}
          <aside
            className={cn(
              "shrink-0 border-r border-surface-border bg-navy transition-all duration-200",
              "fixed inset-y-0 left-0 z-40 w-64 md:static",
              collapsed ? "md:w-[68px]" : "md:w-[clamp(160px,14vw,208px)]",
              sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
            )}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between p-3 md:hidden">
                <span className="text-sm font-bold text-gold">Menu</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded p-1 text-text-muted"
                  aria-label="Close menu"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => setSidebarOpen(false)}>
                <SideNav
                  role={session.role}
                  collapsed={collapsed}
                  canShortcuts={
                    session.role === "super_admin" ||
                    session.permissions.shortcuts_manage
                  }
                />
              </div>
              {/* Desktop collapse control (bottom of the rail) */}
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden items-center gap-2.5 border-t border-surface-border px-5 py-3 text-[13px] text-text-secondary transition hover:text-gold md:flex"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <span aria-hidden className="text-base leading-none">
                  {collapsed ? "»" : "«"}
                </span>
                {!collapsed ? <span>Collapse</span> : null}
              </button>
            </div>
          </aside>
          {/* Overlay for mobile */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/60 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
          )}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </AdminProvider>
  );
}
