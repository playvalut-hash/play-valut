import ForgotForm from "./_forgot-form";

export const instant = false;

/** Forgot password: email entry for the reset flow. Public page
 *  (the proxy matcher never covers /forgot), same visuals as the
 *  login form. */
export default function ForgotPage() {
  return <ForgotForm />;
}
