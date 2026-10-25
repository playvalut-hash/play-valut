-- v3: super-admin guest mode on/off toggle (branding singleton row).
-- Default true preserves today's behaviour (guest entry open) until
-- the super admin flips it off. Code tolerates the column missing
-- (public getBranding falls back to true) until this is run.
alter table public.branding
  add column if not exists guest_mode_enabled boolean not null default true;
