-- 0008_realtime.sql — Realtime fix (Build 35)
-- Run in Supabase Dashboard → SQL Editor (after 0001–0007).
--
-- WHY: chat_messages / deposits were never added to the supabase_realtime
-- publication, so postgres_changes events NEVER fired — the player app saw
-- no live updates at all (an admin approving an account never flipped the
-- player's card from "Creating…" to "Active" without a manual reload).
-- Also, staff had no SELECT policy, so the admin browser's Realtime
-- subscription could not receive rows either (RLS applies to Realtime).

-- =====================================================================
-- 1. Add tables to the Realtime publication (idempotent)
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'deposits'
  ) then
    alter publication supabase_realtime add table public.deposits;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_accounts'
  ) then
    alter publication supabase_realtime add table public.game_accounts;
  end if;
end $$;

-- UPDATE events (e.g. the account-card status flip) must carry the full
-- row so filtered subscriptions (player_id = …) deliver reliably.
alter table public.chat_messages replica identity full;
alter table public.deposits replica identity full;

-- =====================================================================
-- 2. Staff read access for Realtime (SELECT only — writes stay
--    service_role-only, exactly as before).
--    is_staff() is SECURITY DEFINER because admin_users itself has RLS
--    with zero client policies.
-- =====================================================================
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and is_active = true
  );
$$;

drop policy if exists "chat_messages_select_staff" on public.chat_messages;
create policy "chat_messages_select_staff"
  on public.chat_messages for select
  to authenticated
  using (public.is_staff());

drop policy if exists "deposits_select_staff" on public.deposits;
create policy "deposits_select_staff"
  on public.deposits for select
  to authenticated
  using (public.is_staff());

drop policy if exists "game_accounts_select_staff" on public.game_accounts;
create policy "game_accounts_select_staff"
  on public.game_accounts for select
  to authenticated
  using (public.is_staff());

-- Verify: should list chat_messages, deposits, game_accounts.
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' and schemaname = 'public';
