-- 0002_rls.sql — play-valut RLS (PRD §3.12)
-- Run after 0001_schema.sql. Enables RLS on all 11 tables and adds policies.
-- Admins access everything via service_role in server actions — no client
-- policies for admin-only tables.

-- =====================================================================
-- Enable RLS on all tables
-- =====================================================================
alter table public.players         enable row level security;
alter table public.game_accounts   enable row level security;
alter table public.deposits        enable row level security;
alter table public.chat_messages   enable row level security;
alter table public.games           enable row level security;
alter table public.payment_methods enable row level security;
alter table public.player_tags     enable row level security;
alter table public.player_notes    enable row level security;
alter table public.notifications   enable row level security;
alter table public.branding        enable row level security;
alter table public.admin_users     enable row level security;

-- =====================================================================
-- players — player reads/updates ONLY their own row
-- (Inserts happen via handle_new_auth_user() trigger, not from client.)
-- =====================================================================
create policy "players_select_own"
  on public.players for select
  to authenticated
  using (auth.uid() = id);

create policy "players_update_own"
  on public.players for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =====================================================================
-- game_accounts — player SELECTs own rows; INSERTs own rows but ONLY
-- with status = 'creating' (username/password generated server-side,
-- status is flipped to 'active' by admin via service_role).
-- =====================================================================
create policy "game_accounts_select_own"
  on public.game_accounts for select
  to authenticated
  using (auth.uid() = player_id);

create policy "game_accounts_insert_own"
  on public.game_accounts for insert
  to authenticated
  with check (auth.uid() = player_id and status = 'creating');

-- =====================================================================
-- deposits — player SELECTs own rows; INSERTs own rows but ONLY with
-- status = 'pending' (admin approve/reject via service_role only).
-- =====================================================================
create policy "deposits_select_own"
  on public.deposits for select
  to authenticated
  using (auth.uid() = player_id);

create policy "deposits_insert_own"
  on public.deposits for insert
  to authenticated
  with check (auth.uid() = player_id and status = 'pending');

-- =====================================================================
-- chat_messages — player SELECTs own thread; INSERTs ONLY with
-- sender = 'player' (sender-spoofing rejected).
-- =====================================================================
create policy "chat_messages_select_own"
  on public.chat_messages for select
  to authenticated
  using (auth.uid() = player_id);

create policy "chat_messages_insert_own"
  on public.chat_messages for insert
  to authenticated
  with check (auth.uid() = player_id and sender = 'player');

-- =====================================================================
-- games / payment_methods / branding — public (anon + authenticated)
-- read of active rows. Writes: service_role only.
-- branding has no is_active column — plain public SELECT.
-- =====================================================================
create policy "games_public_select_active"
  on public.games for select
  to anon, authenticated
  using (is_active = true);

create policy "payment_methods_public_select_active"
  on public.payment_methods for select
  to anon, authenticated
  using (is_active = true);

create policy "branding_public_select"
  on public.branding for select
  to anon, authenticated
  using (true);

-- =====================================================================
-- player_tags / player_notes / notifications / admin_users —
-- NO client policies at all. RLS is enabled but there are zero policies,
-- so anon + authenticated clients cannot read or write these tables.
-- Admins reach them exclusively via service_role in server actions.
-- =====================================================================
