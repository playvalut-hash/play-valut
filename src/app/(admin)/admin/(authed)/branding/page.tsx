import { redirect } from "next/navigation";

import { getAdminSession, getBranding } from "../../../_actions";
import BrandingEditor from "./branding-editor";

/** Branding page — brand name, logo upload, sign-in copy, live preview. */
export default async function BrandingPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const branding = await getBranding();
  return <BrandingEditor admin={session} branding={branding} />;
}
