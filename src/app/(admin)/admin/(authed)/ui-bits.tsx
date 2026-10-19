"use client";

import { cn } from "@/lib/utils";

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface-elevated font-semibold text-gold",
        size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm",
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function StatusChip({ status }: { status: "creating" | "active" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        status === "active"
          ? "bg-success/15 text-success"
          : "bg-gold/15 text-gold",
      )}
    >
      {status === "active" ? "Active" : "Creating…"}
    </span>
  );
}

export function TagChip({
  tag,
  onRemove,
}: {
  tag: string;
  onRemove?: () => void;
}) {
  const label = tag === "paid" ? "Paid" : tag;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        tag === "paid"
          ? "bg-teal/15 text-teal"
          : "bg-surface-elevated text-text-secondary",
      )}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${label}`}
          className="admin-focus rounded-full text-text-muted hover:text-danger"
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Small icon button with a label for assistive tech. */
export function IconBtn({
  label,
  title,
  onClick,
  disabled,
  danger,
  children,
  className,
}: {
  label: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={cn(
        "admin-focus rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:opacity-40",
        danger && "hover:text-danger",
        className,
      )}
    >
      {children}
    </button>
  );
}
