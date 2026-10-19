import { redirect } from "next/navigation";

import { getAdminSession, getAgents } from "../../../_actions";
import AgentsManager from "./agents-manager";

/** Agent Management page — super-admin only. */
export default async function AgentsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "super_admin") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Not authorized</p>
          <p className="mt-1 text-xs text-text-muted">
            Agent Management is available to super-admins only.
          </p>
        </div>
      </div>
    );
  }
  const agents = await getAgents(session.id);
  return <AgentsManager admin={session} agents={agents} />;
}
