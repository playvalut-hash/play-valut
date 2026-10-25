-- v3: super-admin marketing page on/off toggle (branding singleton row).
-- Default true preserves today's behaviour (guests see the marketing
-- page). OFF sends every guest straight to /login; signed-in players
-- still land in /app. Code tolerates the column missing (public
-- getBranding falls back to true) until this is run.
alter table public.branding
  add column if not exists marketing_page_enabled boolean not null default true;
