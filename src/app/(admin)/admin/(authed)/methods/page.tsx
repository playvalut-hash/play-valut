import { redirect } from "next/navigation";

import { getAdminSession, getPaymentMethods } from "../../../_actions";
import MethodsManager from "./methods-manager";

/** Payment Methods page — admin CRUD over the single payment-methods table. */
export default async function MethodsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const methods = await getPaymentMethods();
  return <MethodsManager admin={session} methods={methods} />;
}
