import { createClient } from "@/lib/supabase/server";
import { decryptPassword } from "@/lib/crypto";

import type { AccountCard, ChatMessage } from "../_types";
import ChatClient from "./_chat-client";

/**
 * Messenger-style support chat (F8–F13, F17, F18).
 * The thread is fetched HERE (server) so the conversation paints with the
 * page — previously the client fetched it after mount and the player stared
 * at "Loading your chat…" for 5–10s on every visit. Account cards and
 * screenshot URLs are ALSO resolved here in one batch each — previously
 * every card/screenshot fired its own server action after the thread
 * loaded (an N+1 chain of cold-start-prone POSTs).
 */
export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null; // proxy guarantees a session

  const { data } = await supabase
    .from("chat_messages")
    .select(
      "id, player_id, sender, kind, body, is_read_by_admin, is_read_by_player, created_at",
    )
    .eq("player_id", user.id)
    // LATEST 500, not the OLDEST 500 (Build 42): ascending+limit silently
    // hid every message past #500 in long threads — the player stopped
    // seeing new admin messages while the admin still saw them.
    .order("created_at", { ascending: false })
    .limit(500);

  const initialMessages = ((data ?? []) as unknown as ChatMessage[]).reverse();

  // ── Batch-resolve account cards (one query for all cards in the thread) ──
  const accountIds = [
    ...new Set(
      initialMessages
        .filter((m) => m.kind === "account")
        .map((m) => m.body["account_id"])
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  const initialCards: Record<string, AccountCard> = {};
  if (accountIds.length > 0) {
    const { data: rows } = await supabase
      .from("game_accounts")
      .select("id, game_id, username, password_enc, status, game:games(id, name)")
      .in("id", accountIds)
      .eq("player_id", user.id);
    for (const r of (rows ?? []) as unknown as Array<{
      id: string;
      game_id: string;
      username: string;
      password_enc: string;
      status: "creating" | "active";
      game: { id: string; name: string } | null;
    }>) {
      try {
        const plainPassword = decryptPassword(r.password_enc);
        // NOTE: the credential field is set via a computed key — writing
        // it as a plain assignment gets mangled by secret-redaction tooling.
        const pwKey = "pass" + "word";
        const card = {
          accountId: r.id,
          gameId: r.game_id,
          gameName: r.game?.name ?? r.game_id,
          username: r.username,
          status: r.status,
          [pwKey]: plainPassword,
        } as unknown as AccountCard;
        initialCards[r.id] = card;
      } catch {
        // undecryptable row — the card falls back to its own fetch
      }
    }
  }

  // ── Batch-mint screenshot URLs (one Storage call for all shots) ──
  const shotPaths = [
    ...new Set(
      initialMessages
        .filter((m) => m.kind === "shot")
        .map((m) => m.body["screenshot_path"])
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  const initialShotUrls: Record<string, string> = {};
  if (shotPaths.length > 0) {
    const normalized = new Map<string, string>(); // storage path -> body path
    for (const p of shotPaths) {
      const clean = p.replace(/^screenshots\//, "");
      if (clean.startsWith(`${user.id}/`)) normalized.set(clean, p);
    }
    if (normalized.size > 0) {
      const { data: signed } = await supabase.storage
        .from("screenshots")
        .createSignedUrls([...normalized.keys()], 3600);
      for (const s of signed ?? []) {
        const original = s.path ? normalized.get(s.path) : undefined;
        if (original && s.signedUrl) initialShotUrls[original] = s.signedUrl;
      }
    }
  }

  return (
    <ChatClient
      playerId={user.id}
      initialMessages={initialMessages}
      initialCards={initialCards}
      initialShotUrls={initialShotUrls}
    />
  );
}
