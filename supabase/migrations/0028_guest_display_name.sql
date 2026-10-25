-- 0028_guest_display_name.sql — anonymous (guest) users have no email and
-- no display_name metadata, so the trigger used to leave their players row
-- nameless (NULL). Fall back to Guest-<first 4 of the id> so support can
-- tell guests apart in the inbox. Email users are unaffected: their branch
-- of the coalesce still wins, and the sendChatMessage upsert uses the
-- same Guest- fallback, so the name is stable from sign-in to first
-- message.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.players (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Guest-' || substr(new.id::text, 1, 4)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
