"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatIcon,
  GamepadIcon,
  HomeIcon,
  UserIcon,
  WalletIcon,
} from "@/components/icons";

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
 * - Mobile: bottom tab bar, fixed to the phone frame, gold active state.
 * - Desktop: left sidebar (like the admin's player-list column), sticky
 *   so it stays put while the page scrolls. The bottom bar is hidden here.
 */
export default function Tabs() {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Player navigation"
        className="fixed bottom-0 left-1/2 z-[60] w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-bg/95 backdrop-blur-xl md:hidden"
        style={{ padding: "6px 6px calc(6px + env(safe-area-inset-bottom))" }}
      >
        <div className="flex">
          {TABS.map(({ href, label, Icon }) => {
            const active = isActiveTab(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-0 py-[7px] text-[11px] font-extrabold transition ${
                  active ? "text-gold" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                <Icon className="h-6 w-6" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      <nav
        aria-label="Player navigation"
        className="hidden w-60 shrink-0 flex-col gap-1 border-r border-line bg-bg p-3 md:sticky md:top-0 md:flex md:h-dvh"
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
