-- Offers ticker (migration 0026): admin-managed offer lines every
-- player sees — desktop right rail (bottom-to-top) + mobile top bar
-- (right-to-left). Run in the Supabase SQL Editor, then verify with
-- the query at the bottom.
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 120),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offers_read_active" ON public.offers;
CREATE POLICY "offers_read_active" ON public.offers
  FOR SELECT USING (is_active = true);

-- Single-row global switch: when ticker_enabled is false the whole
-- ticker (mobile bar + desktop rail) hides, even with offers saved.
-- No row yet means enabled (so the ticker works right after this
-- migration, as soon as the first offer exists).
CREATE TABLE IF NOT EXISTS public.offer_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  ticker_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offer_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offer_settings_read" ON public.offer_settings;
CREATE POLICY "offer_settings_read" ON public.offer_settings
  FOR SELECT USING (true);

-- Verify:
-- SELECT id, text, is_active, sort_order FROM public.offers ORDER BY sort_order, created_at;
-- SELECT * FROM public.offer_settings;
