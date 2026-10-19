import { redirect } from "next/navigation";

import { getAdminSession, getSheetLog } from "../../../_actions";
import SheetTable from "./sheet-table";

/** Sheet Log page — read-only on-screen table of all game accounts. */
export default async function SheetLogPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const rows = await getSheetLog();
  return <SheetTable rows={rows} />;
}
