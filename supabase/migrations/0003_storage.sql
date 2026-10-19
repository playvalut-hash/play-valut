-- 0003_storage.sql — play-valut Storage buckets (PRD §4)
-- Run after 0002_rls.sql.
-- Buckets: screenshots (private), game-icons (public), brand-logos (public),
-- avatars (public). service_role bypasses RLS, so admins read/write all
-- buckets through server actions regardless of these policies.
--
-- File layout convention: <bucket>/<auth.uid()>/<file> for user-owned files,
-- e.g. screenshots/3f2c.../deposit-123.png — every policy below assumes the
-- first path segment is the owner's auth.uid().

-- =====================================================================
-- Buckets (idempotent)
-- =====================================================================
insert into storage.buckets (id, name, public)
values
  ('screenshots', 'screenshots', false),
  ('game-icons', 'game-icons', true),
  ('brand-logos', 'brand-logos', true),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- =====================================================================
-- screenshots (private) — player uploads/reads ONLY their own folder.
-- In practice uploads go through server-minted signed upload URLs;
-- these policies keep direct client access scoped anyway.
-- =====================================================================
create policy "screenshots_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "screenshots_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- game-icons / brand-logos — public read, NO client writes at all
-- (admin writes go through service_role in server actions).
-- =====================================================================
create policy "game_icons_public_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'game-icons');

create policy "brand_logos_public_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'brand-logos');

-- =====================================================================
-- avatars (public) — authenticated read; owner-only write/delete.
-- =====================================================================
create policy "avatars_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
