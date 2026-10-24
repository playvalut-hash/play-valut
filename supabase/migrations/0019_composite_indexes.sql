-- v2 Phase 2, audit M16: composite indexes for the hot queries.
--
-- 0001 created single-column indexes only, but the hot queries filter on
-- combinations, so Postgres either scans or combines indexes:
--   - thread 500-window: chat_messages by player_id, newest first
--   - unread counts: chat_messages by player_id + is_read_by_admin + sender
--   - per-player deposits: deposits by player_id + status
--   - per-player accounts: game_accounts by player_id + status
-- Each composite below matches one hot query. The old single-column
-- indexes are left in place on purpose (tiny tables, zero risk) — the
-- composites cover their leading columns too.
--
-- Zero code change; safe to run any time (small tables, instant build).
--
-- Verify after running (expect 4 rows):
--   select indexname from pg_indexes where indexname in (
--     'idx_chat_messages_player_created',
--     'idx_chat_messages_player_unread',
--     'idx_deposits_player_status',
--     'idx_game_accounts_player_status'
--   ) order by indexname;

create index if not exists idx_chat_messages_player_created
  on public.chat_messages (player_id, created_at desc);

create index if not exists idx_chat_messages_player_unread
  on public.chat_messages (player_id, is_read_by_admin, sender);

create index if not exists idx_deposits_player_status
  on public.deposits (player_id, status);

create index if not exists idx_game_accounts_player_status
  on public.game_accounts (player_id, status);
