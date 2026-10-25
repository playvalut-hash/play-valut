/**
 * Game icon resolution — the single rule for every surface that shows a
 * game image (player home tiles, admin library cards, manager form).
 *
 * A game has TWO icon slots:
 * - icon_path: the ORIGINAL artwork (seed/migration value). Never
 *   overwritten by uploads, so it is always the fallback.
 * - custom_icon_path: an admin-uploaded override. When set, it wins
 *   everywhere; when cleared (Remove), the original shows again.
 *
 * Either slot can hold three shapes, and all three resolve here:
 * - a full http(s) URL (remote artwork) → used as-is;
 * - a "/..." site-local path (self-hosted /icons/...) → used as-is;
 * - a bare storage path (an upload in the public game-icons bucket) →
 *   expanded to its public storage URL. Bare paths used to be handed to
 *   the player site raw, which rendered as a broken image — that is why
 *   an uploaded icon showed in admin but not on the player site.
 */

export function resolveGameIconUrl(
  iconPath: string | null | undefined,
  customIconPath: string | null | undefined,
): string | null {
  const raw = customIconPath || iconPath;
  if (!raw) return null;
  if (/^https?:\/\//.test(raw) || raw.startsWith("/")) return raw;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/game-icons/${raw}`;
}
