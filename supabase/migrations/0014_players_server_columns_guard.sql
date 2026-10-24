-- v2 Phase 1, audit C3: players_update_own (0002) lets any signed-in player
-- UPDATE their own row with no column restriction — including is_blocked.
-- A blocked player could unblock themselves with a direct PostgREST call,
-- bypassing every server-side blocked check.
--
-- Why a trigger and not a narrower policy: Postgres RLS has no column list
-- for UPDATE, and the app legitimately upserts id/display_name/email to
-- players through a user session (requestGameAccount). So the policy stays,
-- and this trigger rejects changes to server-managed columns whenever a
-- real user JWT is present. Service-role calls (admin block/unblock,
-- presence heartbeat) have auth.uid() NULL and are unaffected.
-- Safe to re-run: the function is replaced and the trigger is dropped first.

create or replace function public.players_guard_server_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.is_blocked is distinct from old.is_blocked
      or new.blocked_at is distinct from old.blocked_at
      or new.blocked_by is distinct from old.blocked_by
      or new.is_online is distinct from old.is_online
      or new.last_seen_at is distinct from old.last_seen_at
      or new.created_at is distinct from old.created_at
      or new.id is distinct from old.id
    then
      raise exception 'players: server-managed columns cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists players_guard_server_columns on public.players;
create trigger players_guard_server_columns
  before update on public.players
  for each row execute function public.players_guard_server_columns();
