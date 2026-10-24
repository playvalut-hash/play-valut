import { redirect } from "next/navigation";

import { getAdminSession } from "../../../_actions";
import StorageManager from "./storage-manager";

/** Storage page — super-admin only (v2 Phase 1, audit H7). */
export default async function StoragePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "super_admin") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Not authorized</p>
          <p className="mt-1 text-xs text-text-muted">
            Storage cleanup is available to super-admins only.
          </p>
        </div>
      </div>
    );
  }
  return <StorageManager admin={session} />;
}
