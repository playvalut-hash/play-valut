-- v2 Phase 2, audit M2: one latest message per player, in ONE query.
--
-- Before this, getInboxOverview fetched the newest 500 messages across
-- ALL loaded players and took the first per player — so chatty players
-- crowded quiet ones out of the window, and quiet players' rows wrongly
-- showed "No messages yet" and sorted to the bottom. DISTINCT ON returns
-- exactly one row per messaged player, no matter how chatty the rest are.
--
-- The app calls this via the service client; it falls back to the old
-- 500-window when the function is not deployed yet, so run this any time
-- after the code deploy — the inbox keeps working either way.
--
-- Verify after running:
--   select * from pg_proc where proname = 'player_latest_messages';

create or replace function public.player_latest_messages(player_ids uuid[])
returns table (
  player_id uuid,
  kind text,
  body jsonb,
  created_at timestamptz
)
language sql
stable
as $$
  select distinct on (m.player_id)
    m.player_id, m.kind, m.body, m.created_at
  from public.chat_messages m
  where m.player_id = any (player_ids)
  order by m.player_id, m.created_at desc;
$$;

grant execute on function public.player_latest_messages(uuid[])
  to authenticated, service_role;
