-- v3: super-admin dashboard + moderation alerts + contact form.
--
-- 1. Contact messages from the public site's Contact section. No API
--    access (RLS enabled, no policies): only the service role inserts
--    via the contact form's server action, and the super-admin
--    dashboard reads them.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

-- 2. Moderation alerts for the super admin's bell. New kinds need the
--    CHECK widened; player_id turns nullable because a delete alert
--    must survive its player (the FK cascade would erase an alert
--    tied to the deleted row); player_name snapshots the name at
--    insert time for the same reason. super_admin_only hides the row
--    from agents' bells — the bell filters on it in code, with a
--    pre-migration fallback, so nothing breaks before this runs.
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('message', 'account_request', 'deposit',
                  'player_blocked', 'player_unblocked',
                  'chat_cleared', 'player_deleted'));
alter table public.notifications
  alter column player_id drop not null;
alter table public.notifications
  add column if not exists player_name text;
alter table public.notifications
  add column if not exists super_admin_only boolean not null default false;

-- 3. Guest-to-player conversion timestamp, stamped by the auth
--    callback when it fills a guest's email (Google link). Lets the
--    dashboard count "guest se active" per window. Conversions from
--    before this column stay null and are not counted — only
--    conversions after 0032 runs.
alter table public.players
  add column if not exists activated_at timestamptz;
