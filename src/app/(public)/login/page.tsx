import { getBranding } from "../../_branding-server";
import LoginForm from "./_login-form";


export const instant = false;

/**
 * Player sign-in — reference format (Change 31):
 * full-viewport centered 560px form on desktop, full-screen on mobile.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const branding = await getBranding();
  const params = await searchParams;
  const oauthError = params.error === "oauth";

  return <LoginForm branding={branding} oauthError={oauthError} />;
}
