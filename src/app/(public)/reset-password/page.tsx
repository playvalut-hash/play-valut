import ResetForm from "./_reset-form";

export const instant = false;

/** Reset password: the landing page for Supabase reset links.
 *  Public page (the proxy matcher never covers /reset-password).
 *  The form itself exchanges the ?code= for a session, so the
 *  redirect URL must be in the Supabase Redirect URLs allowlist. */
export default function ResetPasswordPage() {
  return <ResetForm />;
}
