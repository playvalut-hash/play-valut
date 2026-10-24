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
  TrashIcon,
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

const AUDIT_ITEM: NavItem = {
  href: "/admin/audit-log",
  label: "Audit Log",
  icon: NoteIcon,
};

const STORAGE_ITEM: NavItem = {
  href: "/admin/storage",
  label: "Storage",
  icon: TrashIcon,
};

const SHORTCUTS_ITEM: NavItem = {
  href: "/admin/shortcuts",
  label: "Text Shortcuts",
  icon: NoteIcon,
};

/** Left nav for the admin shell. Agents link only renders for super_admins.
 *  `collapsed` (desktop rail) hides labels at md+ only — the mobile drawer
 *  always shows full labels. */
export default function SideNav({
  role,
  collapsed = false,
  canShortcuts = false,
}: {
  role: AdminRole;
  collapsed?: boolean;
  canShortcuts?: boolean;
}) {
  const pathname = usePathname();
  const items = [
    ...ITEMS,
    ...(canShortcuts ? [SHORTCUTS_ITEM] : []),
    ...(role === "super_admin" ? [AGENTS_ITEM, STORAGE_ITEM, AUDIT_ITEM] : []),
  ];

  return (
    <nav
      aria-label="Admin sections"
      className={cn("flex flex-col gap-1 p-3", collapsed && "md:p-2")}
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "admin-focus flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
              collapsed && "md:justify-center md:px-2",
              active
                ? "bg-gold/15 font-medium text-gold"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "md:hidden")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
