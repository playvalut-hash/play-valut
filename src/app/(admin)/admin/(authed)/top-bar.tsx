"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminInfo, NotificationView } from "../../_actions";
import { markNotificationRead } from "../../_actions";
import { cn } from "@/lib/utils";
import { BellIcon, LogoutIcon, XIcon } from "@/components/icons";
import { adminSignOut } from "../../_actions";

function kindLabel(kind: NotificationView["kind"]): string {
  switch (kind) {
    case "account_request":
      return "Account to create";
    case "deposit":
      return "Deposit pending";
    default:
      return "New message";
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Top bar: brand mark, bell with unread dropdown (deep links), agent chip, logout. */
export default function TopBar({
  admin,
  notifications,
  unreadCount,
  hasMoreNotifications,
  loadingMoreNotifications,
  onLoadMoreNotifications,
  onNotificationsOpen,
  onNotificationOpened,
}: {
  admin: AdminInfo;
  notifications: NotificationView[];
  unreadCount: number;
  hasMoreNotifications?: boolean;
  loadingMoreNotifications?: boolean;
  onLoadMoreNotifications?: () => void;
  onNotificationsOpen?: () => void;
  onNotificationOpened?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open ]);

  async function openNotification(n: NotificationView) {
    try {
      await markNotificationRead(admin.id, n.id);
    } catch {
      // Non-fatal: still navigate.
    }
    onNotificationOpened?.(n.id);
    setOpen(false);
    router.push(`/admin?player=${n.playerId}`);
    router.refresh();
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await adminSignOut();
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-navy px-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-sm font-bold text-gold">
          P
        </span>
        <span className="text-[13px] font-semibold text-text-primary">
          PlayVault <span className="font-normal text-text-secondary">Admin</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div ref={wrapRef} className="relative">
          <button
            type="button"
            onClick={() => {
              const willOpen = !open;
              setOpen(willOpen);
              if (willOpen) onNotificationsOpen?.();
            }}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            aria-expanded={open}
            className="admin-focus relative rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            <BellIcon className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span
                className={cn(
                  "admin-bell-pulse absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy",
                )}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-lg border border-surface-border bg-surface-elevated shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
                <span className="text-xs font-semibold text-text-primary">
                  Notifications
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="rounded p-1 text-text-muted hover:text-text-primary"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="admin-thin-scroll max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-text-muted">
                    All caught up — no unread notifications.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openNotification(n)}
                      className="admin-focus block w-full border-b border-surface-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-surface-card"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-gold">
                          {kindLabel(n.kind)}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-primary">
                        <span className="font-medium">{n.playerName}</span>
                        {n.preview ? (
                          <span className="text-text-secondary"> — {n.preview}</span>
                        ) : null}
                      </p>
                    </button>
                  ))
                )}
                {hasMoreNotifications && (
                  <button
                    type="button"
                    onClick={() => onLoadMoreNotifications?.()}
                    disabled={loadingMoreNotifications}
                    className="admin-focus block w-full px-3 py-2.5 text-center text-xs font-semibold text-gold hover:bg-surface-card disabled:opacity-40"
                  >
                    {loadingMoreNotifications ? "Loading…" : "Load older notifications"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <span className="hidden rounded-full border border-surface-border px-2.5 py-1 text-[11px] text-text-secondary sm:block">
          {admin.displayName}
          {admin.role === "super_admin" && (
            <span className="ml-1 font-semibold text-gold">· super</span>
          )}
        </span>

        <button
          type="button"
          onClick={logout}
          disabled={busy}
          aria-label="Log out"
          title="Log out"
          className="admin-focus rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-danger disabled:opacity-50"
        >
          <LogoutIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
