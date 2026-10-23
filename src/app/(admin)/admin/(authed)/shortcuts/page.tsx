import { redirect } from "next/navigation";

import { getAdminSession, getShortcuts, type TextShortcut } from "../../../_actions";
import ShortcutsManager from "./shortcuts-manager";

/**
 * Text Shortcuts (Build 59) — Blaze-style text expander management.
 * Super admins always; agents only with the "shortcuts_manage" grant.
 * Every staff member can USE the enabled shortcuts in chat.
 */
export default async function ShortcutsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.shortcuts_manage) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">Not authorized</p>
          <p className="mt-1 text-xs text-text-muted">
            Text Shortcuts are managed by the super admin. Ask them to grant
            you the “Manage text shortcuts” permission.
          </p>
        </div>
      </div>
    );
  }

  let shortcuts: TextShortcut[] = [];
  let loadError = false;
  try {
    shortcuts = await getShortcuts(session.id);
  } catch {
    loadError = true; // e.g. migration 0012 not run yet
  }
  return (
    <ShortcutsManager admin={session} shortcuts={shortcuts} loadError={loadError} />
  );
}
