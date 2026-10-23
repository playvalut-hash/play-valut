-- 0009_fixes.sql — Missing game + player mark-read RPC (Build 36 testing finds)
-- Run in Supabase Dashboard → SQL Editor (after 0008).

-- =====================================================================
-- 1. Restore the 18th game.
-- WHY: the seed (0004) defines 18 games, but the live table has only 17 —
-- 'thunder' (Ultra Thunder) is missing, so the lobby shows "All games 17".
-- Idempotent: safe to run whether or not the row exists.
-- =====================================================================
insert into public.games
  (id, name, category, icon_path, link, web_link, access,
   first_bonus_pct, reg_bonus_pct, min_load, max_load, redeem_info,
   sort_order, is_active)
values
  ('thunder', 'Ultra Thunder', 'Slots & Fish',
   'https://machinebreakershub.com/api/uploads/game-icons/hd-ultrathunder.png',
   null, null, 'both', 50, 20, 1, 5000, '3×', 18, true)
on conflict (id) do update
  set icon_path = excluded.icon_path,
      is_active = true;

-- =====================================================================
-- 2. Player "mark my thread read" RPC.
-- WHY: chat_messages has SELECT + INSERT policies for players but NO
-- UPDATE policy, so the player's markThreadRead() silently updated
-- 0 rows — is_read_by_player never became true and the admin never saw
-- "Seen". A blanket UPDATE policy would let players edit message bodies
-- in their own thread (support-chat tampering), so instead this
-- SECURITY DEFINER function flips ONLY the read flag on the caller's
-- own rows.
-- =====================================================================
create or replace function public.mark_my_thread_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_messages
  set is_read_by_player = true
  where player_id = auth.uid()
    and is_read_by_player = false;
$$;

revoke all on function public.mark_my_thread_read() from public;
grant execute on function public.mark_my_thread_read() to authenticated;

-- Verify: games count should be 18.
-- select count(*) from public.games where is_active;
