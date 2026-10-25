-- 0025_player_updates_seen.sql — Dismissible player notifications
-- Run in Supabase Dashboard → SQL Editor.
--
-- WHY: the player Menu's Notifications section is derived from decided
-- deposits + activated accounts and had no read state, so entries sat
-- there forever. A single per-player watermark records what the player
-- has already seen: opening the section marks everything visible at
-- that moment as read, and only newer updates appear afterwards.
alter table public.players
  add column if not exists updates_seen_at timestamptz;

-- Verify: the column exists and defaults to null (all past updates show
-- once, then clear when the player opens Notifications).
-- select id, updates_seen_at from public.players limit 5;
