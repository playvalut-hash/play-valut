-- Build 63: real player presence. The player app heartbeats is_online +
-- last_seen_at while open; the admin side treats a player as online only
-- when the flag is set AND the last heartbeat is fresh (< 75s), so a
-- closed/crashed tab ages out on its own.
alter table public.players add column if not exists last_seen_at timestamptz;
