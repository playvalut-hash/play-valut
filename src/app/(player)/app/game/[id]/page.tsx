import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  LinkIcon,
} from "@/components/icons";
import { requestGameAccount } from "../../_actions";
import { gameGradient } from "../../_types";
import type { Game } from "../../_types";

async function getGame(id: string): Promise<Game | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("games")
    .select(
      "id, name, category, icon_path, link, web_link, access, first_bonus_pct, reg_bonus_pct, min_load, max_load, redeem_info, sort_order",
    )
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  return (data ?? null) as unknown as Game | null;
}

/**
 * Game detail sheet (F5, F6): download link, load range, bonus rows,
 * smart Play buttons, Generate-my-account.
 */
export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let existingStatus: "creating" | "active" | null = null;
  if (user) {
    const { data } = await supabase
      .from("game_accounts")
      .select("status")
      .eq("player_id", user.id)
      .eq("game_id", game.id)
      .maybeSingle();
    existingStatus = (data as { status: "creating" | "active" } | null)?.status ?? null;
  }

  const [c1, c2] = gameGradient(game.id);
  const canPlayApp =
    (game.access === "both" || game.access === "app") && !!game.link;
  const canPlayWeb =
    !!game.web_link && (game.access === "both" || game.access === "web");
  const generateAction = requestGameAccount.bind(null, game.id);

  return (
    <div className="px-4 pt-4">
      <Link
        href="/app"
        className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-text-primary transition"
      >
        <ChevronLeftIcon className="h-5 w-5" />
        All games
      </Link>

      {/* Hero tile */}
      <div
        className="mt-3 flex min-h-[150px] flex-col justify-end overflow-hidden rounded-2xl border border-surface-border p-5"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
          {game.category ?? "Game"}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-white drop-shadow">
          {game.name}
        </h1>
      </div>

      {/* Info rows */}
      <dl className="mt-4 space-y-2.5">
        {game.link ? (
          <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3.5">
            <dt className="text-sm font-semibold text-text-secondary">
              Official download
            </dt>
            <dd>
              <a
                href={game.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-gold hover:text-gold-light transition"
              >
                <LinkIcon className="h-4 w-4" />
                Open link
              </a>
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3.5">
          <dt className="text-sm font-semibold text-text-secondary">Load range</dt>
          <dd className="text-sm font-bold text-text-primary">
            ${game.min_load ?? 1} – ${game.max_load ?? 5000}
          </dd>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3.5">
          <dt className="text-sm font-semibold text-text-secondary">
            Signup bonus
          </dt>
          <dd className="text-sm font-bold text-gold">
            +{game.first_bonus_pct}%
          </dd>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3.5">
          <dt className="text-sm font-semibold text-text-secondary">
            Reload bonus
          </dt>
          <dd className="text-sm font-bold text-gold">
            +{game.reg_bonus_pct}%
          </dd>
        </div>
        {game.redeem_info ? (
          <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3.5">
            <dt className="text-sm font-semibold text-text-secondary">
              Redeem playthrough
            </dt>
            <dd className="text-sm font-bold text-text-primary">
              {game.redeem_info}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Smart Play buttons (F6) */}
      {(canPlayApp || canPlayWeb) && (
        <div className={`mt-5 grid gap-3 ${canPlayApp && canPlayWeb ? "grid-cols-2" : "grid-cols-1"}`}>
          {canPlayApp && game.link ? (
            <a
              href={game.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gold text-base font-bold text-text-ongold shadow-[0_4px_20px_rgba(212,175,55,0.25)] transition hover:brightness-110"
            >
              Play
              <ArrowRightIcon className="h-5 w-5" />
            </a>
          ) : null}
          {canPlayWeb && game.web_link ? (
            <a
              href={game.web_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-gold/60 text-base font-bold text-gold transition hover:bg-gold/10"
            >
              Play on web
              <ArrowRightIcon className="h-5 w-5" />
            </a>
          ) : null}
        </div>
      )}

      {/* Account CTA */}
      <div className="mt-5 pb-6">
        {existingStatus ? (
          <Link
            href="/app/accounts"
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-success/50 bg-success/10 text-base font-bold text-success transition hover:bg-success/15"
          >
            {existingStatus === "active" ? (
              <CheckIcon className="h-5 w-5" />
            ) : (
              <ClockIcon className="h-5 w-5" />
            )}
            {existingStatus === "active"
              ? "View my account"
              : "Account is being created — view status"}
          </Link>
        ) : (
          <form action={generateAction}>
            <button
              type="submit"
              className="w-full rounded-xl bg-gold py-4 text-base font-bold text-text-ongold shadow-[0_4px_20px_rgba(212,175,55,0.25)] transition hover:brightness-110 active:scale-[0.99] min-h-[56px]"
            >
              Generate my account
            </button>
            <p className="mt-2 text-center text-xs text-text-muted">
              Your login lands in chat and under My Game Accounts.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
