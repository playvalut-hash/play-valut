-- v2 Phase 1, audit H9: durable audit trail.
--
-- Before this, audit() wrote to stdout only — Vercel logs scroll away and
-- nothing durable recorded who did what. Every admin action now also
-- inserts a row here (best-effort: a failed insert never breaks the
-- action). The table is append-only by convention — no code path updates
-- or deletes rows.
--
-- RLS is enabled with NO policies: only the service role (server actions)
-- can read or write. Signed-in user JWTs — including staff — get nothing
-- directly, so a compromised player token can never read the trail.
-- admin_id has deliberately NO foreign key: audit rows must survive the
-- admin's deletion.
--
-- Growth note: at ~100 admin actions/day this table grows ~36k rows/year
-- (a few MB) — no retention sweep needed for years.
--
-- Verify after running:
--   select * from pg_tables where tablename = 'audit_log';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_admin_idx on public.audit_log (admin_id, created_at desc);

alter table public.audit_log enable row level security;
-- No policies: service role bypasses RLS; everyone else gets nothing.
