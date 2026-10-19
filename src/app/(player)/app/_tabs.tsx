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
      className="fixed bottom-0 left-1/2 z-[60] w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-bg/95 backdrop-blur-xl"
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
  );
}
