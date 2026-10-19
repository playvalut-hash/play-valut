import { redirect } from "next/navigation";

import {
  getAdminSession,
  getGames,
  getInboxOverview,
  getPaymentMethods,
  getPlayerDetail,
  getThread,
  markThreadRead,
} from "../../_actions";
import type { ChatMessageView } from "../../_actions";
import InboxShell from "./inbox-shell";

/** Business Inbox — /admin. Deep links: /admin?player=<id>. */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { player: playerParam } = await searchParams;

  // Overview + games + methods in parallel (were sequential).
  const [overview, games, methods] = await Promise.all([
    getInboxOverview(),
    getGames(),
    getPaymentMethods(),
  ]);

  const selected = playerParam
    ? (overview.find((p) => p.id === playerParam) ?? null)
    : null;

  // Thread + detail in parallel (were sequential).
  const [thread, detail] = selected
    ? await Promise.all([getThread(selected.id), getPlayerDetail(selected.id)])
    : [[], null] as [ChatMessageView[], null];

  if (selected) {
    // Opening the thread clears its unread state for this admin.
    // Fire-and-forget: don't block page render.
    markThreadRead(session.id, selected.id).catch(() => {});
  }

  const tagOptions = [...new Set(overview.flatMap((p) => p.tags))].sort();

  return (
    <InboxShell
      admin={session}
      overview={overview}
      selectedId={selected?.id ?? null}
      thread={thread}
      detail={detail}
      games={games.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))}
      gamesCount={games.filter((g) => g.isActive).length}
      methodsCount={methods.filter((m) => m.isActive).length}
      tagOptions={tagOptions}
    />
  );
}
