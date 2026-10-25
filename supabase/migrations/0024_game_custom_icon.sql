-- 0024_game_custom_icon.sql — Custom game icons with original fallback
-- Run in Supabase Dashboard → SQL Editor.
--
-- WHY: the Games Library "Upload icon" used to overwrite games.icon_path
-- directly, so the original artwork was lost (and a bare storage path
-- rendered broken on the player site, which uses the value raw). From
-- now on uploads go to custom_icon_path and the original stays in
-- icon_path forever: clearing the custom restores the original on
-- every surface.
alter table public.games
  add column if not exists custom_icon_path text;

-- Juwa 2: the uploaded portrait currently sits in icon_path. Preserve
-- it as the custom icon and restore the original artwork URL, so the
-- manager's new Remove button can bring the original back. The guard
-- skips rows whose icon_path is already the original.
update public.games
set custom_icon_path = icon_path,
    icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-juwa2.webp'
where (name ilike '%juwa 2%' or name ilike '%juwa2%')
  and icon_path <> 'https://machinebreakershub.com/api/uploads/game-icons/hd-juwa2.webp';

-- Verify: Juwa 2 should show the original URL + the portrait as custom.
-- select id, name, icon_path, custom_icon_path from public.games
-- where name ilike '%juwa%';
