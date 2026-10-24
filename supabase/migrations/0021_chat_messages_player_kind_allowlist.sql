-- 0021 — v2 Phase 2, audit M6: restrict player-insertable chat kinds.
-- WHY: chat_messages_insert_own only checked sender = 'player', so any
-- player holding a JWT could insert ANY kind directly via PostgREST —
-- e.g. a forged kind = 'account' card or kind = 'system' message in
-- their own thread (support-confusion / screenshot-spoofing vector).
-- The app itself sends player messages only through server actions
-- (service role, bypasses RLS) with kinds 'text' (chat) and 'shot'
-- (screenshot) — the browser never inserts chat_messages directly, so
-- no legitimate flow loses anything. Admin/service inserts are
-- unaffected (RLS bypass).
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
  on public.chat_messages for insert
  to authenticated
  with check (
    auth.uid() = player_id
    and sender = 'player'
    and kind in ('text', 'shot')
  );
