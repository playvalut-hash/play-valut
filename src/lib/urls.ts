/**
 * Link safety (v2 Phase 1, audit H1).
 *
 * Agent-entered links (game app/web links, payment pay_links) are rendered
 * as clickable anchors in the player app AND the admin back office, so a
 * stored `javascript:` / `data:` / `vbscript:` URL is stored XSS. Only
 * absolute http(s) URLs are ever treated as links.
 *
 * The WHATWG URL parser normalizes the tricks (uppercase schemes, embedded
 * tabs/newlines, surrounding whitespace) before we check the protocol, so
 * those bypass attempts are caught here rather than at each call site.
 */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns the URL when it is safe to render as an anchor href, else null. */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isSafeHttpUrl(trimmed) ? trimmed : null;
}
