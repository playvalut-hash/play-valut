-- 0033 — activation card kind (guest activation link as a card).
-- WHY: the admin's "Activation link" used to arrive as a plain text
-- bubble with a raw URL in it. It now sends as kind "activate" with
-- body {url}, rendered as a gold card on both sides (like the account
-- and payment cards). The kind CHECK constraint still lists only the
-- 0022 kinds, so the insert would fail with a check violation — this
-- widens the allowlist; nothing else changes. Run in the SQL Editor,
-- then verify with:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.chat_messages'::regclass and contype = 'c';
alter table public.chat_messages drop constraint chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
  check (kind in ('text', 'account', 'games_list', 'pay_list', 'payment_card', 'shot', 'system', 'player_note', 'admin_note', 'activate'));
