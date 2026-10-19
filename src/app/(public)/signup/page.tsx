import { getBranding } from "../../_branding-server";
import SignupForm from "./_signup-form";


export const instant = false;

/** Player sign-up: display name + email + password. */
export default async function SignupPage() {
  const branding = await getBranding();
  return <SignupForm branding={branding} />;
}
