import { redirect } from "next/navigation";

export const instant = false;

/** Registration is removed (v3): the signup route now sends everyone
 *  to /login, where new players enter with Continue with Google
 *  (account created on first sign-in) or as a guest. Keeping the
 *  route as a redirect instead of deleting it avoids a dead link
 *  for anyone with the old URL bookmarked. */
export default function SignupPage() {
  redirect("/login");
}
