-- 0022 — side-specific chat note kinds (already-active picks).
-- WHY: the player-only note (player_note) and admin-only note
-- (admin_note) are new chat_messages kinds, but the original schema
-- (0001) has a CHECK constraint on kind that lists only the seven
-- original kinds — so inserts of the two new kinds fail with a check
-- violation. The failure was silent (deliverAccount ignores note
-- insert results), which is why the card landed but neither note did.
-- This widens the allowlist; nothing else changes. Run in the SQL
-- Editor, then verify with:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.chat_messages'::regclass and contype = 'c';
alter table public.chat_messages drop constraint chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
  check (kind in ('text', 'account', 'games_list', 'pay_list', 'payment_card', 'shot', 'system', 'player_note', 'admin_note'));
