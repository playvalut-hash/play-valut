import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GamepadIcon } from "@/components/icons";
import AccountRow from "./_account-row";
import type { GameAccount } from "../_types";

/** My Game Accounts: newest on top, masked passwords, copy/show (F7, F9). */
export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let accounts: GameAccount[] = [];
  if (user) {
    const { data } = await supabase
      .from("game_accounts")
      .select("id, game_id, username, status, created_at, game:games(id, name)")
      .eq("player_id", user.id)
      .order("created_at", { ascending: false });
    accounts = (data ?? []) as unknown as GameAccount[];
  }

  return (
    <div className="px-4 pt-5">
      <h1 className="text-xl font-extrabold text-text-primary">
        My Game Accounts
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Your logins for every game. Newest first.
      </p>

      {accounts.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-surface-border bg-surface-card p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold">
            <GamepadIcon className="h-7 w-7" />
          </span>
          <p className="mt-4 font-bold text-text-primary">No accounts yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Pick a game from the lobby and tap “Generate my account”.
          </p>
          <Link
            href="/app"
            className="mt-5 rounded-xl bg-gold px-6 py-3 text-sm font-bold text-text-ongold transition hover:brightness-110"
          >
            Browse games
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3 pb-6">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
