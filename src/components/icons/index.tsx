/**
 * PlayVault SVG icon library.
 *
 * 24px grid, stroke 1.8, currentColor — no emoji anywhere in UI chrome
 * (PRD §7). Every icon used in the app must exist here.
 */

type IconProps = {
  className?: string;
};

function Base({
  className,
  children,
  label,
}: IconProps & { children: React.ReactNode; label: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Home">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </Base>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Chat">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Base>
  );
}

export function WalletIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Wallet">
      <path d="M20 7H4a2 2 0 0 1-2-2 2 2 0 0 1 2-2h16v4" />
      <path d="M20 7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5" />
      <circle cx="16.5" cy="14" r="1" />
    </Base>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Menu">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Base>
  );
}

export function GamepadIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Games">
      <rect x="2" y="7" width="20" height="11" rx="5.5" />
      <path d="M7 10.5v5" />
      <path d="M4.5 13h5" />
      <line x1="16" y1="11.5" x2="16.01" y2="11.5" />
      <line x1="18.5" y1="14.5" x2="18.51" y2="14.5" />
    </Base>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Notifications">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Base>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Search">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </Base>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Add">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Base>
  );
}

export function EditIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Edit">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </Base>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Delete">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Base>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Close">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Base>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Check">
      <polyline points="20 6 9 17 4 12" />
    </Base>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Expand">
      <polyline points="6 9 12 15 18 9" />
    </Base>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Back">
      <polyline points="15 18 9 12 15 6" />
    </Base>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Next">
      <polyline points="9 18 15 12 9 6" />
    </Base>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Copy">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Base>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Show">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Hide">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </Base>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Upload">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </Base>
  );
}

export function ImageIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Image">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </Base>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Send">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Base>
  );
}

export function TagIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Tag">
      <path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.83z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </Base>
  );
}

export function NoteIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Note">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </Base>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Log out">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </Base>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Admin">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Base>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Agents">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Base>
  );
}

export function CardIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Payment method">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </Base>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Open link">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Base>
  );
}

export function SparklesIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Rewards">
      <path d="M12 3l1.88 5.76a2 2 0 0 0 1.36 1.36L21 12l-5.76 1.88a2 2 0 0 0-1.36 1.36L12 21l-1.88-5.76a2 2 0 0 0-1.36-1.36L3 12l5.76-1.88a2 2 0 0 0 1.36-1.36L12 3z" />
    </Base>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Pending">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </Base>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Base className={className} label="Continue">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Base>
  );
}
