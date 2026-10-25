-- 0023 — deposits minimum: app says $1, DB said $5.
-- WHY: MIN_DEPOSIT is 1 in the app (src/lib/utils.ts), so a $1 deposit
-- passes validation and uploads its screenshot — then the INSERT fails
-- on the original schema's check (amount >= 5), surfacing as the generic
-- "Couldn't record the deposit. Try again." (the screenshot was already
-- uploaded and is cleaned up as an orphan). $5 worked; $1 never could.
-- This aligns the DB floor with the app's $1 minimum. Run in the SQL
-- Editor, then verify with:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.deposits'::regclass and contype = 'c';
alter table public.deposits drop constraint deposits_amount_check;
alter table public.deposits add constraint deposits_amount_check
  check (amount >= 1 and amount <= 5000);
