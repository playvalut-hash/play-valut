import { redirect } from "next/navigation";

import {
  getAdminSession,
  getGames,
  getInboxOverview,
  getPaymentMethods,
  getPlayerDetail,
  getThread,
} from "../../_actions";
import InboxShell from "./inbox-shell";

/** Business Inbox — /admin. Player selection is client-side (instant).
 *  A ?player=<id> deep link (the bell's notification click) preselects
 *  that player server-side, so the click lands on the right conversation
 *  instead of an empty list — previously the parameter was ignored and
 *  the click appeared to do nothing. */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string | string[] }>;
}) {
  // Everything in ONE parallel batch — previously the session check ran
  // first and the overview only started after it returned (~1s wasted).
  const [session, overview, games, methods] = await Promise.all([
    getAdminSession(),
    getInboxOverview(),
    getGames(),
    getPaymentMethods(),
  ]);
  if (!session) redirect("/admin/login");

  // Deep link AFTER the session check: getThread/getPlayerDetail throw
  // for a malformed id, and an unknown id simply yields no conversation
  // (the list view stays) — never a broken page.
  const sp = await searchParams;
  const rawPlayer = Array.isArray(sp.player) ? sp.player[0] : sp.player;
  let selectedId: string | null = null;
  let thread: Awaited<ReturnType<typeof getThread>> = [];
  let detail: Awaited<ReturnType<typeof getPlayerDetail>> = null;
  if (rawPlayer) {
    try {
      const [t, d] = await Promise.all([
        getThread(rawPlayer),
        getPlayerDetail(rawPlayer),
      ]);
      if (d) {
        selectedId = rawPlayer;
        thread = t;
        detail = d;
      }
    } catch {
      // unknown / malformed player — fall through to the list view
    }
  }

  const tagOptions = [...new Set(overview.flatMap((p) => p.tags))].sort();

  return (
    <InboxShell
      // Keyed by the bell deep link: the shell's selection state only
      // initializes on mount, so a notification click while ALREADY on
      // the inbox must remount it to open the new player — otherwise
      // the click silently kept the old thread open. Plain /admin keeps
      // the stable "inbox" key, so returning from another section still
      // restores the open conversation from the session snapshot.
      key={selectedId ? `player-${selectedId}` : "inbox"}
      admin={session}
      overview={overview}
      selectedId={selectedId}
      thread={thread}
      detail={detail}
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
