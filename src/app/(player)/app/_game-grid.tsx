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
      className="group relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-xl border border-surface-border p-3 transition hover:-translate-y-0.5 hover:border-gold/50"
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      aria-label={`${game.name} — ${accountStatus ? "account ready" : "get an account"}`}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(80% 60% at 80% 0%, rgba(255,255,255,0.5), transparent 60%)",
        }}
      />
      {accountStatus ? (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-success backdrop-blur">
          <CheckIcon className="h-3 w-3" />
          Account ready
        </span>
      ) : null}
      <div className="relative">
        <p className="text-sm font-extrabold leading-tight text-white drop-shadow">
          {game.name}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-gold-light drop-shadow">
          {bonusText}
        </p>
      </div>
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
          <div className="mt-3 grid grid-cols-2 gap-3 pb-6 sm:grid-cols-3">
            {filtered.map((tile) => (
              <GameTile key={tile.game.id} tile={tile} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
