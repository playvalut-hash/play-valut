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
  const overview = await getInboxOverview();
  const selected = playerParam
    ? (overview.find((p) => p.id === playerParam) ?? null)
    : null;

  const thread: ChatMessageView[] = selected ? await getThread(selected.id) : [];
  const detail = selected ? await getPlayerDetail(selected.id) : null;
  if (selected) {
    // Opening the thread clears its unread state for this admin.
    await markThreadRead(session.id, selected.id);
  }

  const [games, methods] = await Promise.all([getGames(), getPaymentMethods()]);
  const tagOptions = [...new Set(overview.flatMap((p) => p.tags))].sort();

  return (
    <InboxShell
      admin={session}
      overview={overview}
      selectedId={selected?.id ?? null}
      thread={thread}
      detail={detail}
      gamesCount={games.filter((g) => g.isActive).length}
      methodsCount={methods.filter((m) => m.isActive).length}
      tagOptions={tagOptions}
    />
  );
}
