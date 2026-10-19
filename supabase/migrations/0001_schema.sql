-- 0001_schema.sql — play-valut core schema (PRD §3 + Amendment 1)
-- Run first. Creates all 11 tables, indexes, FKs, unique constraints,
-- updated_at triggers, and the auth.users → players trigger.

create extension if not exists "pgcrypto";

-- =====================================================================
-- players — one row per portal player. id = auth.users.id
-- =====================================================================
create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  avatar_url text,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- admin_users — separate admin login. id = auth.users.id
-- roles: 'super_admin' | 'agent' (Amendment 1)
-- =====================================================================
create table public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'agent'
    check (role in ('super_admin', 'agent')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- games — game catalog. Public seed data, id = text slug.
-- =====================================================================
create table public.games (
  id text primary key,
  name text not null,
  category text,
  icon_path text,
  link text,
  web_link text,
  access text not null default 'both'
    check (access in ('both', 'app', 'web')),
  first_bonus_pct integer not null default 0,
  reg_bonus_pct integer not null default 0,
  min_load numeric,
  max_load numeric,
  redeem_info text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- payment_methods — ONE table feeding deposit picker, chat tiles, admin.
-- =====================================================================
create table public.payment_methods (
  id text primary key,
  name text not null,
  brand_color text,
  account_name text not null,
  handle text not null,
  pay_link text,
  note text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- game_accounts — player game credentials. R1: UNIQUE(player_id, game_id)
-- password_enc holds AES-256-GCM ciphertext (never plaintext).
-- =====================================================================
create table public.game_accounts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  game_id text not null references public.games(id) on delete restrict,
  username text not null,
  password_enc text not null,
  status text not null default 'creating'
    check (status in ('creating', 'active')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint game_accounts_player_game_unique unique (player_id, game_id)
);

-- =====================================================================
-- deposits — amount 5..5000. Approval does NOT credit any balance.
-- =====================================================================
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  amount numeric(10, 2) not null
    check (amount >= 5 and amount <= 5000),
  payment_method_id text not null references public.payment_methods(id) on delete restrict,
  screenshot_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.admin_users(id) on delete set null
);

-- =====================================================================
-- chat_messages — one shared thread per player.
-- body shapes (see PRD §3.4): text | account | games_list | pay_list |
-- payment_card | shot | system
-- =====================================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  sender text not null check (sender in ('player', 'admin', 'system')),
  kind text not null default 'text'
    check (kind in ('text', 'account', 'games_list', 'pay_list', 'payment_card', 'shot', 'system')),
  body jsonb not null,
  is_read_by_admin boolean not null default false,
  is_read_by_player boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- player_tags — admin-only tags ('Paid' rule lives server-side). Lowercased.
-- =====================================================================
create table public.player_tags (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  tag text not null check (tag = lower(trim(tag)) and char_length(trim(tag)) > 0),
  created_at timestamptz not null default now(),
  constraint player_tags_player_tag_unique unique (player_id, tag)
);

-- =====================================================================
-- player_notes — private admin notes, never shown to the player.
-- =====================================================================
create table public.player_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  body text not null,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- notifications — admin inbox bell. kind: message | account_request | deposit
-- =====================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('message', 'account_request', 'deposit')),
  player_id uuid not null references public.players(id) on delete cascade,
  ref_id uuid,
  preview text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- branding — single row (id = 1). Public read.
-- =====================================================================
create table public.branding (
  id integer primary key check (id = 1),
  brand_name text not null default 'PlayVault',
  logo_path text,
  signin_heading text not null default 'Welcome Back',
  signin_subtext text not null default 'Sign in to continue your lobby journey',
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- Indexes
-- =====================================================================
create index idx_game_accounts_player on public.game_accounts (player_id);
create index idx_game_accounts_game on public.game_accounts (game_id);
create index idx_deposits_player on public.deposits (player_id);
create index idx_deposits_status on public.deposits (status);
create index idx_chat_messages_player on public.chat_messages (player_id);
create index idx_chat_messages_created on public.chat_messages (created_at);
create index idx_player_tags_player on public.player_tags (player_id);
create index idx_player_notes_player on public.player_notes (player_id);
create index idx_notifications_player on public.notifications (player_id);
create index idx_notifications_created on public.notifications (created_at desc);
create index idx_games_sort on public.games (sort_order);
create index idx_methods_sort on public.payment_methods (sort_order);

-- =====================================================================
-- updated_at trigger (branding)
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_branding_updated_at
  before update on public.branding
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- handle_new_auth_user() — auth.users insert → players row
-- =====================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.players (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_new_auth_user on auth.users;
create trigger trg_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
