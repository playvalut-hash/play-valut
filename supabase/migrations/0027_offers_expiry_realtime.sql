-- Live ticker (migration 0027): offers get an optional expiry, and
-- the tables join the realtime publication so players see adds,
-- pauses, deletes and the on/off switch instantly — no page reload.
-- Run in the Supabase SQL Editor, then verify with the query below.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Realtime events only flow for tables in the publication. Skip
-- silently when the publication does not exist (the 30s safety poll
-- in the player app still covers those cases), and swallow the
-- already-a-member error on re-runs.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime
        ADD TABLE public.offers, public.offer_settings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'offers' AND column_name = 'expires_at';
-- SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--   AND tablename IN ('offers', 'offer_settings');
