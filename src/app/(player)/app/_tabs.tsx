"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatIcon,
  GamepadIcon,
  HomeIcon,
  UserIcon,
  WalletIcon,
} from "@/components/icons";
import {
  isDrawerOpen,
  setDrawerOpen,
  subscribeDrawer,
} from "./_nav-drawer-store";

const TABS = [
  { href: "/app", label: "Home", Icon: HomeIcon },
  { href: "/app/chat", label: "Chat", Icon: ChatIcon },
  { href: "/app/accounts", label: "Accounts", Icon: GamepadIcon },
  { href: "/app/wallet", label: "Wallet", Icon: WalletIcon },
  { href: "/app/menu", label: "Menu", Icon: UserIcon },
] as const;

function isActiveTab(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Player navigation — two faces of the same tabs:
 * - Mobile: a slim header (WhatsApp-style app bar) with a hamburger
 *   that slides a sidebar drawer in from the left. The header is an
 *   ordinary in-flow row, NOT pinned — it scrolls away with the page
 *   and only the offers ticker stays pinned. On the chat page the
 *   header is hidden entirely and its hamburger lives in the chat's
 *   own Support header instead (three stacked bars looked bad).
 * - Desktop: left sidebar (like the admin's player-list column), sticky
 *   so it stays put while the page scrolls.
 */
export default function Tabs() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpenState] = useState(isDrawerOpen());
  useEffect(
    () => subscribeDrawer(() => setDrawerOpenState(isDrawerOpen())),
    [],
  );
  const hideMobileHeader = pathname === "/app/chat";
  return (
    <>
      {/* Mobile header + drawer */}
      {!hideMobileHeader && (
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-bg px-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-primary transition hover:bg-white/5"
          >
            {/* Hamburger: three dashes */}
            <span className="flex flex-col gap-[5px]" aria-hidden="true">
              <span className="block h-[2px] w-5 rounded bg-current" />
              <span className="block h-[2px] w-5 rounded bg-current" />
              <span className="block h-[2px] w-5 rounded bg-current" />
            </span>
          </button>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold font-display text-[11px] font-extrabold text-black">
            PV
          </span>
          <span className="font-display text-base font-extrabold text-text-primary">
            PlayVault
          </span>
        </div>
      )}
      {/* Drawer: always mounted, slides in from the left like a sidebar */}
      <div className="md:hidden" aria-hidden={!drawerOpen}>
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setDrawerOpen(false)}
          tabIndex={drawerOpen ? 0 : -1}
          className={`fixed inset-0 z-[65] bg-black/60 transition-opacity ${
            drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <nav
          aria-label="Player navigation"
          inert={!drawerOpen}
          className={`fixed inset-y-0 left-0 z-[70] flex w-72 max-w-[80vw] flex-col border-r border-line bg-bg p-3 transition-transform duration-300 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
            <div className="mb-3 flex items-center gap-3 px-2 pb-3 pt-1">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold font-display text-[13px] font-extrabold text-black">
                PV
              </span>
              <span className="flex-1 font-display text-lg font-extrabold text-text-primary">
                PlayVault
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition hover:bg-white/5 hover:text-text-primary"
              >
                <span className="text-xl leading-none" aria-hidden="true">
                  ×
                </span>
              </button>
            </div>
            {TABS.map(({ href, label, Icon }) => {
              const active = isActiveTab(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${
                    active
                      ? "bg-gold/10 text-gold"
                      : "text-ink-3 hover:bg-white/5 hover:text-ink-2"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
        </nav>
      </div>
      <nav
        aria-label="Player navigation"
        className="hidden w-[clamp(180px,16vw,240px)] shrink-0 flex-col gap-1 border-r border-line bg-bg p-3 md:sticky md:top-0 md:flex md:h-dvh"
      >
        <div className="mb-3 flex items-center gap-3 px-2 pb-3 pt-1">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold font-display text-[13px] font-extrabold text-black">
            PV
          </span>
          <span className="font-display text-lg font-extrabold text-text-primary">
            PlayVault
          </span>
        </div>
        {TABS.map(({ href, label, Icon }) => {
          const active = isActiveTab(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${
                active
                  ? "bg-gold/10 text-gold"
                  : "text-ink-3 hover:bg-white/5 hover:text-ink-2"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
