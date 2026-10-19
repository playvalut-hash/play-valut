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
  { href: "/app/accounts", label: "Accounts", Icon: GamepadIcon },
  { href: "/app/wallet", label: "Wallet", Icon: WalletIcon },
  { href: "/app/chat", label: "Chat", Icon: ChatIcon },
  { href: "/app/menu", label: "Menu", Icon: UserIcon },
] as const;

function isActiveTab(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar — fixed to the phone frame, gold active state. */
export default function Tabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Player navigation"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 border-t border-surface-border bg-navy/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActiveTab(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
                active ? "text-gold" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
