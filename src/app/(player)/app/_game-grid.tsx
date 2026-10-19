"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckIcon, SearchIcon, SparklesIcon } from "@/components/icons";
import { BrandMark, BrandName, brandLogoUrl, type Branding } from "../../_branding";
import { gameGradient } from "./_types";
import type { TileData } from "./page";

function GameTile({ tile }: { tile: TileData }) {
  const { game, accountStatus, bonusText } = tile;
  const [c1, c2] = gameGradient(game.id);
  return (
    <Link
      href={`/app/game/${game.id}`}
      className="gtile group block overflow-hidden rounded-2xl border border-line bg-card p-0 text-left text-ink transition active:scale-[0.97]"
      aria-label={`${game.name} — ${accountStatus ? "account ready" : "get an account"}`}
    >
      <div
        className="relative grid h-[82px] place-items-center"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        {accountStatus ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-green px-[7px] py-[2px] text-[10px] font-extrabold text-[#03231a]">
            Account ready
          </span>
        ) : null}
        {bonusText ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-[7px] py-[2px] text-[10px] font-extrabold text-gold-2">
            Bonus
          </span>
        ) : null}
      </div>
      <p className="px-2.5 pb-[3px] pt-2 text-[13.5px] font-extrabold leading-tight">
        {game.name}
      </p>
      {bonusText ? (
        <p className="flex flex-wrap gap-x-2 gap-y-0.5 px-2.5 pb-2.5 text-[11px] font-extrabold text-gold-2">
          {bonusText}
        </p>
      ) : null}
    </Link>
  );
}

export default function GameGrid({
  branding,
  tiles,
}: {
  branding: Branding;
  tiles: TileData[];
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
        <a
          href="#games"
          className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-text-ongold shadow-[0_4px_20px_rgba(212,175,55,0.25)] transition hover:brightness-110"
        >
          Play Now
        </a>
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

      {/* Games grid */}
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
          <div className="mt-3 grid grid-cols-3 gap-[11px] pb-6">
            {filtered.map((tile) => (
              <GameTile key={tile.game.id} tile={tile} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
