-- v2 Phase 1, audit H6: game usernames must be unique per game.
--
-- Before this, the only uniqueness on game_accounts was
-- (player_id, game_id) — one account per player per game — while usernames
-- were prefix + 6 random digits with NO uniqueness at all, so two players
-- could receive the same game login (a certainty at scale: ~39% chance of
-- at least one collision at 1,000 accounts for one game). The old code
-- comment claiming "uniqueness is enforced DB-side (R1)" was wrong, and
-- neither create path retried on collision.
--
-- This migration never fails and never renames anything: if duplicates
-- already exist it reports each one as a NOTICE and skips the index, so
-- the user can resolve them first (rename one player's username for that
-- game, in the portal and in the game system), then re-run this migration.
-- The app code (insertGameAccountWithUniqueUsername) retries on
-- unique-violation either way; the index is what makes that retry correct
-- under concurrency.
--
-- Verify after running:
--   select indexname from pg_indexes
--   where tablename = 'game_accounts'
--     and indexname = 'game_accounts_game_username_unique';

do $$
declare
  dup record;
  has_dupes boolean := false;
begin
  for dup in
    select game_id, username, count(*) as n
    from public.game_accounts
    group by game_id, username
    having count(*) > 1
  loop
    has_dupes := true;
    raise notice 'H6 duplicate: game_id=%, username=%, count=%',
      dup.game_id, dup.username, dup.n;
  end loop;
  if has_dupes then
    raise notice 'H6: unique index NOT created — resolve the duplicates above first, then re-run this migration.';
  else
    create unique index if not exists game_accounts_game_username_unique
      on public.game_accounts (game_id, username);
    raise notice 'H6: unique index game_accounts_game_username_unique created.';
  end if;
end $$;
