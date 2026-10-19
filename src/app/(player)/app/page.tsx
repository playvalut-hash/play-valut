import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getBranding } from "../../_branding-server";
import { tileBonusText } from "@/lib/utils";
import GameGrid from "./_game-grid";
import type { Game } from "./_types";

export interface TileData {
  game: Game;
  accountStatus: "creating" | "active" | null;
  bonusText: string;
}

/** Home lobby: games grid, search, account-ready tags, bonus lines (F3, F4). */
export default async function HomePage() {
  const supabase = await createClient();

  // Branding + session + games in parallel (were sequential).
  const [branding, { data: { user } }, { data: gamesData }] = await Promise.all([
    getBranding(),
    supabase.auth.getUser(),
    supabase
      .from("games")
      .select(
        "id, name, category, icon_path, link, web_link, access, first_bonus_pct, reg_bonus_pct, min_load, max_load, redeem_info, sort_order",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);
  const games = (gamesData ?? []) as unknown as Game[];

  let accounts: Array<{ game_id: string; status: "creating" | "active" }> = [];
  let isPaid = false;
  if (user) {
    // Accounts + tags in parallel (were sequential).
    const service = createServiceClient();
    const [{ data: accData }, { data: tagData }] = await Promise.all([
      supabase.from("game_accounts").select("game_id, status").eq("player_id", user.id),
      service.from("player_tags").select("tag").eq("player_id", user.id),
    ]);
    accounts = (accData ?? []) as unknown as typeof accounts;
    isPaid = ((tagData ?? []) as Array<{ tag: string }>).some(
      (t) => t.tag === "paid",
    );
  }

  const tiles: TileData[] = games.map((game) => {
    const account = accounts.find((a) => a.game_id === game.id) ?? null;
    return {
      game,
      accountStatus: account ? account.status : null,
      // R3: signup bonus hidden for Paid + Active. R4: bonus text on tiles only.
      bonusText: tileBonusText(
        { signupBonusPct: game.first_bonus_pct, reloadBonusPct: game.reg_bonus_pct },
        { onTile: true, isPaid, isActive: account?.status === "active" },
      ),
    };
  });

  return <GameGrid branding={branding} tiles={tiles} />;
}
