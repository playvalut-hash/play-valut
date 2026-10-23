-- 0012_text_shortcuts.sql — admin text-expander shortcuts (Build 59)
-- Shared, centrally managed shortcuts (Blaze-style): staff type a short
-- key + space in any admin chat and it expands to the full text.
-- Managed by the super admin (or agents granted "shortcuts_manage");
-- usable by every staff member in chat.

create table if not exists public.text_shortcuts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  expansion text not null,
  description text,
  is_enabled boolean not null default true,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.text_shortcuts enable row level security;
-- No public policies on purpose: every read/write goes through the
-- service role after server-side permission checks (app-wide pattern).
