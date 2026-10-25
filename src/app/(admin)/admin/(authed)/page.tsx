import { redirect } from "next/navigation";

import {
  getAdminSession,
  getGames,
  getInboxOverview,
  getPaymentMethods,
} from "../../_actions";
import InboxShell from "./inbox-shell";

/** Business Inbox — /admin. Player selection is client-side (instant). */
export default async function InboxPage() {
  // Everything in ONE parallel batch — previously the session check ran
  // first and the overview only started after it returned (~1s wasted).
  const [session, overview, games, methods] = await Promise.all([
    getAdminSession(),
    getInboxOverview(),
    getGames(),
    getPaymentMethods(),
  ]);
  if (!session) redirect("/admin/login");

  const tagOptions = [...new Set(overview.flatMap((p) => p.tags))].sort();

  return (
    <InboxShell
      admin={session}
      overview={overview}
      selectedId={null}
      thread={[]}
      detail={null}
      games={games.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))}
      gamesCount={games.filter((g) => g.isActive).length}
      methods={methods
        .filter((m) => m.isActive)
        .map((m) => ({
          id: m.id,
          name: m.name,
          brandColor: m.brandColor,
          // Full snapshot so the SEND-bar card echo is exact — no
          // "Loading…" handle flicker while the server round trip runs.
          accountName: m.accountName,
          handle: m.handle,
          note: m.note,
          payLink: m.payLink,
        }))}
      methodsCount={methods.filter((m) => m.isActive).length}
      tagOptions={tagOptions}
    />
  );
}
