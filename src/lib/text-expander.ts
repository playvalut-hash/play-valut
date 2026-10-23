/**
 * Text-expander core (Build 59) — pure helpers shared by the admin chat
 * composer, the shortcut management actions and the unit tests.
 *
 * Rule (Blaze-style): typing a known shortcut key followed by a SPACE
 * replaces "key " with the expansion. The key must stand alone (start of
 * the text or right after whitespace) so it never fires inside a bigger
 * word like "ty" inside "party".
 */

export const SHORTCUT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function normalizeShortcutKey(raw: string): string | null {
  const k = raw.trim().toLowerCase();
  return SHORTCUT_KEY_PATTERN.test(k) ? k : null;
}

export interface ExpansionResult {
  value: string;
  cursor: number;
}

export function expandShortcut(
  value: string,
  cursor: number,
  shortcuts: ReadonlyMap<string, string>,
): ExpansionResult | null {
  if (cursor < 1 || value[cursor - 1] !== " ") return null;

  // The word immediately before the trigger space.
  let start = cursor - 1;
  while (start > 0 && !/\s/.test(value[start - 1])) start--;
  const word = value.slice(start, cursor - 1);
  if (!word) return null;

  const expansion = shortcuts.get(word.toLowerCase());
  if (expansion === undefined) return null;

  // Continue-typing space, unless the expansion already ends with one
  // (or with a newline — a paragraph usually ends the thought).
  const tail =
    expansion.endsWith(" ") || expansion.endsWith("\n") ? "" : " ";
  const replacement = expansion + tail;
  return {
    value: value.slice(0, start) + replacement + value.slice(cursor),
    cursor: start + replacement.length,
  };
}
