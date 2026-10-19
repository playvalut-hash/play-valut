# play-valut — Supabase migrations runbook

SQL files only. These are run **manually in the Supabase dashboard** — they are
never applied by code. Run them in numeric order: `0001` → `0002` → `0003` → `0004`.

Keys/secrets never belong in these files or in this runbook.

## Step 1 — Run the migrations

1. Open the Supabase dashboard → your `play-valut` project → **SQL Editor**.
2. Click **New query**.
3. Paste the entire contents of `0001_schema.sql` → **Run**. Wait for success
   (it should report success with no rows returned).
4. Click **New query** again, paste `0002_rls.sql` → **Run**.
5. Repeat for `0003_storage.sql` → **Run**.
6. Repeat for `0004_seed.sql` → **Run**.

Re-running is safe: `0003` inserts are `ON CONFLICT DO NOTHING`, `0004` inserts
are `ON CONFLICT DO NOTHING`, and the trigger/extension creations in `0001` are
idempotent (`OR REPLACE`, `IF NOT EXISTS`).

### Verify it worked

Run this in the SQL Editor:

```sql
select count(*) as games            from public.games;            -- expect 18
select count(*) as payment_methods  from public.payment_methods;  -- expect 5
select count(*) as branding         from public.branding;         -- expect 1
select count(*) as buckets          from storage.buckets
  where id in ('screenshots','game-icons','brand-logos','avatars'); -- expect 4
```

## Step 2 — Create the first super_admin

The very first admin user must be created by hand. Do this **in the dashboard**:

1. Decide the admin email (e.g. your own email).
2. Go to **Authentication → Users → Add user → Create new user**, enter the email
   + a strong password, **auto-confirm** the user (toggle "Auto Confirm User").
3. Copy that user's **UUID** from the users table.
4. In the SQL Editor, run:

```sql
insert into public.admin_users (id, email, display_name, role)
values (
  '<PASTE_THE_AUTH_USER_UUID_HERE>',
  'admin@example.com',   -- must match the user created in step 2
  'Owner',
  'super_admin'
);
```

5. Sign in at `https://<your-app>/admin/login` with that email + password.
6. In the Agent Management page (super-admin only), create any further agents —
   after this, nobody needs raw SQL for agents again.

Notes:
- `admin_users.role` allows only `'super_admin'` or `'agent'` (DB check constraint).
- Player sign-up at `/login` / `/signup` never creates admin rows — player and
  admin accounts are completely separate auth users, and the middleware rejects
  player JWTs on `/admin/*`.
- Admins read/write all tables via the **service_role key in server actions only**;
  RLS intentionally has *no* client policies for admin-only tables
  (`player_tags`, `player_notes`, `notifications`, `admin_users`).

## Step 3 — Google OAuth provider (separate user action, required for "Continue with Google")

The code ships the Google button + callback handling, but Google sign-in only works
once the project owner enables the provider:

1. Dashboard → **Authentication → Providers → Google** → enable it.
2. Enter the **Client ID** and **Client Secret** from your Google Cloud OAuth
   client (APIs & Services → Credentials).
3. The Supabase redirect/callback URL shown on that page must be added to the
   Google Cloud client's **Authorized redirect URIs**.

If Google is not configured yet, the app shows a friendly "not configured yet"
toast instead of breaking. New Google users get a `players` row automatically via
the `handle_new_auth_user()` trigger on first sign-in.

## Optional but recommended (after migrations)

- **Auth email templates:** Dashboard → Authentication → Email Templates — set the
  brand name ("PlayVault" placeholder, or the final brand) so reset/signup emails
  don't say "Supabase".
- **Realtime:** enable Realtime on `chat_messages`, `deposits`, `notifications`,
  `game_accounts` (Database → Replication → toggle per table).
