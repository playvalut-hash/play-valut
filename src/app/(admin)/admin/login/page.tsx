import { redirect } from "next/navigation";

import { getAdminSession } from "../../_actions";
import LoginForm from "./login-form";


export const instant = false;

/** Admin sign-in page. Already-authorized admins go straight to the inbox. */
export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");
  return <LoginForm />;
}
