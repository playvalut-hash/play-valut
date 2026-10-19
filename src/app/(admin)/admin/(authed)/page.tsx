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
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  // Overview + games + methods in parallel.
  const [overview, games, methods] = await Promise.all([
    getInboxOverview(),
    getGames(),
    getPaymentMethods(),
  ]);

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
      methodsCount={methods.filter((m) => m.isActive).length}
      tagOptions={tagOptions}
    />
  );
}
