import { redirect } from "next/navigation";

import { getAdminSession, getNotifications, getUnreadNotificationCount } from "../../_actions";
import { AdminProvider } from "./admin-context";
import SideNav from "./side-nav";
import TopBar from "./top-bar";


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

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(),
    getUnreadNotificationCount(),
  ]);

  return (
    <AdminProvider value={session}>
      <div className="flex h-dvh flex-col overflow-hidden bg-near-black">
        <TopBar
          admin={session}
          notifications={notifications}
          unreadCount={unreadCount}
        />
        <div className="flex min-h-0 flex-1">
          <aside className="w-52 shrink-0 border-r border-surface-border bg-navy">
            <SideNav role={session.role} />
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </AdminProvider>
  );
}
