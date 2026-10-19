-- 0006_players_insert_policy.sql — allow users to create their own players row
-- (needed for chat upsert when trigger didn't create the row, e.g. staff testing)

create policy "players_insert_own"
  on public.players for insert
  to authenticated
  with check (auth.uid() = id);
