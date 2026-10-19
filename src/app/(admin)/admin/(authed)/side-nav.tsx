"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AdminRole } from "../../_actions";
import { cn } from "@/lib/utils";
import {
  CardIcon,
  ChatIcon,
  GamepadIcon,
  NoteIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Inbox", icon: ChatIcon, exact: true },
  { href: "/admin/games", label: "Games Library", icon: GamepadIcon },
  { href: "/admin/methods", label: "Payment Methods", icon: CardIcon },
  { href: "/admin/branding", label: "Branding", icon: SparklesIcon },
  { href: "/admin/sheet-log", label: "Sheet Log", icon: NoteIcon },
];

const AGENTS_ITEM: NavItem = {
  href: "/admin/agents",
  label: "Agent Management",
  icon: UsersIcon,
};

/** Left nav for the admin shell. Agents link only renders for super_admins. */
export default function SideNav({ role }: { role: AdminRole }) {
  const pathname = usePathname();
  const items = role === "super_admin" ? [...ITEMS, AGENTS_ITEM] : ITEMS;

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "admin-focus flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
              active
                ? "bg-gold/15 font-medium text-gold"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
