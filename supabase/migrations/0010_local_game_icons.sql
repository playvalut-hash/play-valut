-- 0010_local_game_icons.sql — Self-hosted game icons (Build 36 speed pass)
-- Run in Supabase Dashboard → SQL Editor (after 0009).
--
-- WHY: game icons were hotlinked "HD" originals from a third-party site —
-- 4,536 KB total (Ultra Thunder alone 2,017 KB) downloaded into 82px
-- lobby tiles. The icons are now resized (256px WebP, 249 KB total) and
-- shipped inside the app itself at /icons/games/<id>.webp, served from
-- the same origin/CDN as the site.

update public.games set icon_path = '/icons/games/' || id || '.webp';

-- Verify: every active game should have a local icon path.
-- select id, icon_path from public.games order by sort_order;
