/**
 * Email masking — the one rule for every surface that shows a player's
 * email. A masked address shows a recognisable fragment and hides the
 * rest: "s9shigri@gmail.com" → "s9****@gmail.com". Full addresses are
 * only ever returned to the super admin (enforced server-side in the
 * admin actions); players always see their own address masked, and
 * agents always see players' addresses masked.
 */
export function maskEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${shown}****@${domain}`;
}
