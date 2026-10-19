-- 0005_staff_trigger_fix.sql — agents/super-admins must NOT appear as players
-- Run after 0004. Fixes: agent accounts showing in player inbox.

-- 1. Trigger skips players-row creation for staff users
--    (createAgent sets user_metadata.is_staff = true)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce((new.raw_user_meta_data ->> 'is_staff'), 'false') = 'true' then
    return new;
  end if;
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

-- 2. Clean up: remove players rows that belong to admin_users (existing agents)
delete from public.players
where id in (select id from public.admin_users);
