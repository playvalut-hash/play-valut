-- v2 Phase 1, audit H5: per-player inbox counts in ONE grouped query.
--
-- Before this, getInboxOverview fetched EVERY unread message row (plus every
-- pending-deposit and creating-account row) for the loaded players on every
-- inbox poll and realtime event — unbounded growth with unread volume.
-- The app calls this via the service client; it falls back to the old row
-- fetches when the function is not deployed yet, so run this any time
-- after the code deploy — the inbox keeps working either way.
--
-- Verify after running:
--   select * from pg_proc where proname = 'player_overview_counts';

create or replace function public.player_overview_counts(player_ids uuid[])
returns table (
  player_id uuid,
  unread_count bigint,
  pending_count bigint,
  creating_count bigint
)
language sql
stable
as $$
  select
    p.id,
    coalesce(u.c, 0),
    coalesce(d.c, 0),
    coalesce(a.c, 0)
  from unnest(player_ids) as p(id)
  left join (
    select m.player_id, count(*) as c
    from public.chat_messages m
    where m.sender = 'player'
      and m.is_read_by_admin = false
      and m.player_id = any (player_ids)
    group by m.player_id
  ) u on u.player_id = p.id
  left join (
    select d.player_id, count(*) as c
    from public.deposits d
    where d.status = 'pending'
      and d.player_id = any (player_ids)
    group by d.player_id
  ) d on d.player_id = p.id
  left join (
    select a.player_id, count(*) as c
    from public.game_accounts a
    where a.status = 'creating'
      and a.player_id = any (player_ids)
    group by a.player_id
  ) a on a.player_id = p.id;
$$;

grant execute on function public.player_overview_counts(uuid[])
  to authenticated, service_role;
