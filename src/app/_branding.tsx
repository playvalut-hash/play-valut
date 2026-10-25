import { tokens } from "@/styles/tokens";

/**
 * Client-safe branding helpers (types, logo URL builder, brand lockup).
 * Server-side fetching lives in ./_branding-server (imports next/headers).
 */

export interface Branding {
  brand_name: string;
  logo_path: string | null;
  signin_heading: string;
  signin_subtext: string;
  /** Site-wide guest entry switch (migration 0029, super-admin only).
   *  True = marketing + login offer "continue as guest". Existing
   *  guest sessions keep working when off — they are pushed to
   *  activate, never kicked out (kicking would orphan their chat). */
  guest_mode_enabled: boolean;
}

export const FALLBACK_BRANDING: Branding = {
  brand_name: "PlayVault",
  logo_path: null,
  signin_heading: "Welcome Back",
  signin_subtext: "Sign in to continue your lobby journey",
  guest_mode_enabled: true,
};

/** Public URL for the brand logo (brand-logos bucket is public). */
export function brandLogoUrl(logoPath: string | null): string | null {
  if (!logoPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/brand-logos/${logoPath}`;
}

/**
 * Split a brand name into [whitePart, goldPart] for the white+gold lockup.
 * "PlayVault" → ["Play", "Vault"]; "My Portal" → ["My", "Portal"].
 */
export function splitBrandName(name: string): [string, string] {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  const words = spaced.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return [words[0], words.slice(1).join(" ")];
  }
  const single = words[0] ?? "PlayVault";
  const cut = Math.ceil(single.length / 2);
  return [single.slice(0, cut), single.slice(cut)];
}

/** Default diamond mark shown when no logo is uploaded. */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Brand logo"
    >
      <rect
        x="10"
        y="10"
        width="28"
        height="28"
        rx="6"
        transform="rotate(45 24 24)"
        fill={tokens.colors.gold}
      />
      <rect
        x="17"
        y="17"
        width="14"
        height="14"
        rx="3"
        transform="rotate(45 24 24)"
        fill={tokens.colors.navy}
      />
    </svg>
  );
}

/** Brand name lockup: first part white, rest gold. */
export function BrandName({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const [whitePart, goldPart] = splitBrandName(name);
  return (
    <span className={className}>
      <span className="text-text-primary">{whitePart}</span>
      {goldPart ? <span className="text-gold">{goldPart}</span> : null}
    </span>
  );
}
