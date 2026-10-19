import { redirect } from "next/navigation";

import { getAdminSession } from "../../_actions";
import AdminShell from "./admin-shell";


/** All pages here are auth-gated: skip prerendering. */
export const instant = false;

/**
 * Authenticated admin shell. Gates every /admin/* route except /admin/login
 * (which lives outside this group): requires a session AND an active
 * admin_users row, otherwise back to /admin/login.
 */
export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  // Notifications load lazily via client (was 2 blocking DB queries per page).
  return <AdminShell session={session}>{children}</AdminShell>;
}
