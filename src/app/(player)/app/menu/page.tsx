import { createClient } from "@/lib/supabase/server";
import MenuClient from "./_menu-client";

export interface PlayerUpdate {
  id: string;
  title: string;
  detail: string;
  at: string;
  tone: "success" | "danger" | "gold";
}

interface PlayerProfile {
  display_name: string;
  email: string | null;
  avatar_url: string | null;
}

/** Menu: profile, accounts, notifications, support links, logout (F36). */
export default async function MenuPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: PlayerProfile = {
    display_name: "Player",
    email: null,
    avatar_url: null,
  };
  const updates: PlayerUpdate[] = [];
  let seenAt: string | null = null;

  if (user) {
    // Profile + deposit updates in parallel (both depend only on user).
    // The player row retries without updates_seen_at when migration
    // 0025 has not run yet, so the deploy never breaks on the old DB.
    const playerPromise = (async () => {
      const run = (cols: string) =>
        supabase.from("players").select(cols).eq("id", user.id).maybeSingle();
      const first = await run(
        "display_name, email, avatar_url, updates_seen_at",
      );
      if (first.error && /updates_seen_at/.test(first.error.message ?? "")) {
        return run("display_name, email, avatar_url");
      }
      return first;
    })();
    const [{ data: playerRow }, { data: deposits }] = await Promise.all([
      playerPromise,
      supabase
        .from("deposits")
        .select(
          "id, status, admin_note, created_at, decided_at, method:payment_methods(name)",
        )
        .eq("player_id", user.id)
        .not("decided_at", "is", null)
        .order("decided_at", { ascending: false })
        .limit(10),
    ]);
    if (playerRow) {
      const row = playerRow as unknown as PlayerProfile & {
        updates_seen_at?: string | null;
      };
      profile = {
        display_name: row.display_name || "Player",
        email: row.email ?? user.email ?? null,
        avatar_url: row.avatar_url ?? null,
      };
      seenAt = row.updates_seen_at ?? null;
    }
    for (const d of (deposits ?? []) as unknown as Array<{
      id: string;
      status: string;
      admin_note: string | null;
      decided_at: string;
      method: { name: string } | null;
    }>) {
      updates.push({
        id: `deposit-${d.id}`,
        title:
          d.status === "approved" ? "Deposit approved" : "Deposit rejected",
        detail:
          d.status === "approved"
            ? `${d.method?.name ?? "Deposit"} verified by support.`
            : d.admin_note ?? "Support declined this deposit — ask in chat.",
        at: d.decided_at,
        tone: d.status === "approved" ? "success" : "danger",
      });
    }

    const { data: accounts } = await supabase
      .from("game_accounts")
      .select("id, activated_at, game:games(name)")
      .eq("player_id", user.id)
      .eq("status", "active")
      .not("activated_at", "is", null)
      .order("activated_at", { ascending: false })
      .limit(10);
    for (const a of (accounts ?? []) as unknown as Array<{
      id: string;
      activated_at: string;
      game: { name: string } | null;
    }>) {
      updates.push({
        id: `account-${a.id}`,
        title: `Account active: ${a.game?.name ?? "Game"}`,
        detail: "Your login is ready under My Game Accounts.",
        at: a.activated_at,
        tone: "gold",
      });
    }

    updates.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    // Seen updates never show again: the watermark (migration 0025)
    // hides everything the player had already seen when they last
    // opened Notifications. Without the column (pre-migration) every
    // update shows, as before.
    if (seenAt) {
      const seenMs = new Date(seenAt).getTime();
      for (let i = updates.length - 1; i >= 0; i--) {
        if (new Date(updates[i].at).getTime() <= seenMs) updates.splice(i, 1);
      }
    }
  }

  return <MenuClient profile={profile} updates={updates} />;
}
