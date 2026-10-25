"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon, SparklesIcon } from "@/components/icons";
import { BrandMark, BrandName, brandLogoUrl, type Branding } from "../../_branding";
import { resolveGameIconUrl } from "@/lib/game-icon";
import { gameGradient } from "./_types";
import type { TileData } from "./page";

function money(n: number | null | undefined): string {
  if (n == null) return "$0";
  return `$${Number(n).toLocaleString()}`;
}

function GameTile({ tile, isPaid }: { tile: TileData; isPaid: boolean }) {
  const { game, accountStatus } = tile;
  const [c1, c2] = gameGradient(game.id);
  const paidRegular = accountStatus === "active" && isPaid;
  const badgePct = paidRegular ? game.reg_bonus_pct : game.first_bonus_pct;
  const iconUrl = resolveGameIconUrl(
    game.icon_path,
    game.custom_icon_path ?? null,
  );

  return (
    <Link
      href={`/app/game/${game.id}`}
      className="gtile tilt-3d block w-full rounded-2xl border border-white/10 bg-surface-card p-3 text-center text-ink transition active:scale-[0.97]"
      aria-label={`${game.name} — ${accountStatus ? "account ready" : "get an account"}`}
    >
      <span
        className="gtile-art relative mx-auto block w-full max-w-[180px] overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          borderRadius: "16px",
          aspectRatio: "1 / 1",
        }}
      >
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt={`${game.name} official game artwork`}
            loading="lazy"
            className="absolute inset-0 block h-full w-full object-cover"
          />
        ) : null}
        {accountStatus ? (
          <span className="own absolute left-1.5 top-1.5 rounded-full bg-green px-[7px] py-[2px] text-[10px] font-extrabold text-[#03231a]">
            {accountStatus === "active" ? "Account ready" : "Activating…"}
          </span>
        ) : null}
        {badgePct ? (
          <span className="badge absolute right-1.5 top-1.5 rounded-full bg-black/55 px-[7px] py-[2px] text-[10px] font-extrabold text-gold-2">
            +{badgePct}%
          </span>
        ) : null}
      </span>
      <span className="gtile-name block px-0.5 pt-2 text-[14px] font-extrabold leading-tight text-white">
        {game.name}
      </span>
      <span className="gtile-sub block px-0.5 pb-0.5 text-[11px] font-semibold text-ink-3">
        {game.category ?? "Sweeps"} · Load {money(game.min_load)}–{money(game.max_load)}
      </span>
      <span className="gtile-bonuses flex flex-wrap justify-center gap-x-2 gap-y-0.5 px-0.5 text-[11px] font-extrabold text-gold-2">
        {paidRegular ? (
          <span>Reload +{game.reg_bonus_pct}%</span>
        ) : (
          <>
            <span>Signup +{game.first_bonus_pct}%</span>
            <span>Reload +{game.reg_bonus_pct}%</span>
          </>
        )}
      </span>
    </Link>
  );
}

export default function GameGrid({
  branding,
  tiles,
  isPaid,
  hasAccount,
}: {
  branding: Branding;
  tiles: TileData[];
  isPaid: boolean;
  /** The player already holds at least one game account. */
  hasAccount: boolean;
}) {
  const [query, setQuery] = useState("");
  const logoUrl = brandLogoUrl(branding.logo_path);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tiles;
    return tiles.filter(
      (t) =>
        t.game.name.toLowerCase().includes(q) ||
        (t.game.category ?? "").toLowerCase().includes(q),
    );
  }, [tiles, query]);

  return (
    <div className="px-4 pt-5">
      {/* Header: brand + gold Play Now pill */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${branding.brand_name} logo`}
              className="h-9 w-9 rounded-lg object-contain"
            />
          ) : (
            <BrandMark size={36} />
          )}
          <BrandName
            name={branding.brand_name}
            className="text-xl font-extrabold tracking-tight"
          />
        </div>
        {/* Header: brand + gold Play Now pill. Players who already hold
            an account go straight to their accounts to play; new players
            go to support chat to get set up. */}
        <Link
          href={hasAccount ? "/app/accounts" : "/app/chat"}
          className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-black shadow-[0_4px_20px_rgba(212,175,55,0.25)] transition hover:brightness-110"
        >
          Play Now
        </Link>
      </header>

      {/* Search */}
      <div className="mt-4">
        <label className="block">
          <span className="sr-only">Search games</span>
          <span className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-input px-4 py-3 focus-within:border-gold/60 transition">
            <SearchIcon className="h-5 w-5 shrink-0 text-text-muted" />
            <input
              type="search"
              placeholder="Search games…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-base text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </span>
        </label>
      </div>

      {/* Explore / promos banner */}
      <Link
        href="/app/explore"
        className="mt-4 flex items-center gap-3 rounded-xl border border-gold/30 bg-surface-card px-4 py-3.5 transition hover:border-gold/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-bold text-text-primary">
            Promotions & rewards
          </span>
          <span className="block text-xs text-text-secondary">
            Announcements and your promo code
          </span>
        </span>
      </Link>

      {/* Games grid — v2: 3-col, no card chrome */}
      <section id="games" aria-label="Games" className="scroll-mt-4">
        <h2 className="mt-6 text-base font-bold text-text-primary">
          All games
          <span className="ml-2 text-xs font-semibold text-text-muted">
            {filtered.length}
          </span>
        </h2>
        {filtered.length === 0 ? (
          <p className="mt-6 rounded-xl border border-surface-border bg-surface-card p-6 text-center text-sm text-text-secondary">
            No games match “{query}”.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-3 pb-6 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((tile) => (
              <GameTile key={tile.game.id} tile={tile} isPaid={isPaid} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
