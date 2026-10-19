"use client";

import { useState } from "react";
import { XIcon } from "@/components/icons";
import type { AdminInfo } from "../../_actions";
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

export default function AdminShell({
  session,
  children,
}: {
  session: AdminInfo;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AdminProvider value={session}>
      <div className="flex h-dvh flex-col overflow-hidden bg-near-black">
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
          <div className="min-w-0 flex-1">
            <TopBar admin={session} notifications={[]} unreadCount={0} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          {/* Sidebar — hidden on mobile unless open */}
          <aside
            className={cn(
              "shrink-0 border-r border-surface-border bg-navy transition-all",
              "fixed inset-y-0 left-0 z-40 w-64 md:static md:w-52",
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
                <SideNav role={session.role} />
              </div>
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
