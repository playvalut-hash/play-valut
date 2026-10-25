-- v3: guest lifecycle — logout hides, 24h idle deletes, device memory
-- survives so a returning guest is recognised.
--
-- Rule (owner direction): a guest who leaves the chat or logs out
-- WITHOUT activating (no signup) vanishes from the admin site, and
-- after 24h of inactivity their rows vanish from the database too.
-- The device record below is deliberately NOT deleted with them: it
-- holds no chat, no accounts, no deposits — only a per-browser key,
-- a SHA-256 hash of the IP (never the raw IP), and visit timestamps —
-- so the admin can see "this device came before" when it returns.
create extension if not exists pgcrypto;

alter table public.players
  add column if not exists guest_device_key text,
  add column if not exists returning_guest boolean not null default false,
  add column if not exists guest_left_at timestamptz;

create table if not exists public.guest_devices (
  device_key text primary key,
  ip_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 1,
  last_guest_name text,
  last_guest_id uuid
);

-- No API access at all: only the service role and the SECURITY DEFINER
-- function below touch this table (RLS enabled, no policies).
alter table public.guest_devices enable row level security;

-- Track one guest session against its browser device. Called from the
-- guest app on mount with a localStorage UUID (NOT a hardware
-- fingerprint) plus the request IP, which is hashed in-DB.
-- Returns true when this device has guest-visited before.
-- Only unactivated guests (email IS NULL) are tracked; activation ends
-- tracking, and the player's own row keeps the flag for the inbox chip.
-- Deliberately does NOT touch last_seen_at: the C3 trigger
-- (players_guard_server_columns) rejects last_seen_at changes whenever
-- a user JWT is present, and the presence heartbeat (service role)
-- already stamps last_seen_at every 25s while the app is open.
create or replace function public.track_guest_device(p_device_key text, p_ip text)
returns boolean
language plpgsql
security definer
-- NOTE: pgcrypto lives in the extensions schema on Supabase, NOT in
-- public — with search_path = public alone, digest() is invisible at
-- runtime ("function digest(text, unknown) does not exist") and every
-- tracking call fails. All table refs below are public-qualified and
-- auth.uid() is schema-qualified, so widening the path only affects
-- the digest() call. Keep extensions here.
set search_path = public, extensions
as $$
declare
  v_guest_id uuid := auth.uid();
  v_name text;
  v_dev public.guest_devices%rowtype;
  v_returning boolean := false;
  v_ip_hash text := null;
begin
  if v_guest_id is null or p_device_key is null or p_device_key = '' then
    return false;
  end if;
  if p_ip is not null and p_ip <> '' then
    v_ip_hash := encode(digest(p_ip, 'sha256'), 'hex');
  end if;
  -- Guests only: a registered player (email set) never gets a row.
  select display_name into v_name from public.players
    where id = v_guest_id and email is null;
  if v_name is null then
    return false;
  end if;
  select * into v_dev from public.guest_devices
    where device_key = p_device_key;
  if not found then
    insert into public.guest_devices
      (device_key, ip_hash, last_guest_name, last_guest_id)
      values (p_device_key, v_ip_hash, v_name, v_guest_id);
  elsif v_dev.last_guest_id = v_guest_id then
    -- Same guest session reloading: refresh activity, don't bump visits.
    update public.guest_devices
      set last_seen_at = now(),
          ip_hash = coalesce(v_ip_hash, ip_hash)
      where device_key = p_device_key;
    v_returning := v_dev.visit_count > 1;
  else
    -- Same device, NEW guest session: this device came before.
    update public.guest_devices
      set last_seen_at = now(),
          visit_count = v_dev.visit_count + 1,
          last_guest_name = v_name,
          last_guest_id = v_guest_id,
          ip_hash = coalesce(v_ip_hash, ip_hash)
      where device_key = p_device_key;
    v_returning := true;
  end if;
  update public.players
    set guest_device_key = p_device_key,
        returning_guest = v_returning
    where id = v_guest_id;
  return v_returning;
end;
$$;
