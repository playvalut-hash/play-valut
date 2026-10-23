-- 0011_permissions.sql — staff permissions + player blocking (Build 43)
-- Super admin (role = 'super_admin') always has every permission.
-- Agents get individual permissions granted by the super admin,
-- stored as a jsonb map on admin_users, e.g.
--   {"player_block": true, "chat_clear": false, "player_delete": false}
-- Known keys: player_block | chat_clear | player_delete

alter table public.admin_users
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.players
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid
    references public.admin_users(id) on delete set null;
