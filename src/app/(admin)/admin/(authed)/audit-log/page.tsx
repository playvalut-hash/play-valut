import { redirect } from "next/navigation";

import { getAdminSession, getAuditLog } from "../../../_actions";
import AuditTable from "./audit-table";

/** Audit Log page — super-admin only (v2 Phase 1, audit H9). */
export default async function AuditLogPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "super_admin") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Not authorized</p>
          <p className="mt-1 text-xs text-text-muted">
            The audit log is available to super-admins only.
          </p>
        </div>
      </div>
    );
  }
  const rows = await getAuditLog(session.id);
  return <AuditTable admin={session} initialRows={rows} />;
}
