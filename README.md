# PlayVault — Sweepstakes Agent Portal

A single-brand agent portal for a sweepstakes business: players request
game accounts, deposit with screenshot proof, and chat with support;
agents manage players, accounts, deposits, and chats. The games
themselves are **not** played here — this is the front desk for
account management, manual load/redeem, and support.

**Two apps, strictly separate URLs — never linked from each other:**

- Player app: `/login`, `/app/*` (lobby, game accounts, wallet, chat)
- Admin app: `/admin/login`, `/admin/*` (inbox, players, games,
  payments, agents, audit log, storage)

**Product rules that must not regress:**

- The wallet shows deposits + history only — **no balance is displayed
  anywhere**.
- Deposits are verified **manually from screenshots**; there is no
  payment gateway and the portal never holds money.
- Game passwords are AES-256-GCM encrypted; only the server can
  decrypt them.

## Stack

- Next.js 16.4.2 (App Router) + React 19.3.0 + TypeScript (strict)
- Tailwind CSS v4, self-hosted variable fonts (Bricolage Grotesque,
  Manrope, JetBrains Mono — no Google Fonts at runtime)
- Supabase: Postgres + Auth + Storage + Realtime
  (project region `ap-south-1`, Vercel functions pinned to `bom1`
  via `vercel.json`)
- zod v4 (all action inputs), vitest v5 (mock-based tests only)

## Architecture (the shape to preserve)

- **Server actions are the only data path.** Admin actions bind every
  call to the acting admin's session (`src/app/(admin)/_auth.ts`);
  reads that need no mutation still require a session admin, except
  `getBranding` (public login/signup pages need it).
- **Service-role + RLS, deliberately.** Server actions use the service
  key (RLS bypass is intentional); the browser client is limited by
  RLS: players can only touch their own rows, can only insert chat
  kinds `text`/`shot`, and cannot change server-managed columns
  (guarded by a trigger, migration 0014).
- **Audit trail.** Every mutating admin action writes a row to
  `audit_log` (service-role only, no policies) and to stdout;
  super-admins read it at `/admin/audit-log`.
- **Chat** is server-rendered with Realtime + safety polls (admin 10 s,
  player 15 s); if Realtime drops, polling carries the thread.
  Thread history pages in both directions (latest 500, then older).
- **Catalog cache.** Games + payment methods are cached per server
  instance for 60 s — that staleness is accepted (no invalidation
  signal can reach other Vercel instances) and fetch failures are
  logged while stale rows still serve.
- **Screenshots.** 30-day retention for all screenshots (deposit
  proofs + chat images); clearing a chat deletes its screenshots
  immediately from storage and from DB references. A pending
  deposit's proof is also deleted on clear — the player must resend.
  That is the operator's explicit instruction, not a bug.
- **Security headers** on every route (nosniff, `DENY` framing,
  strict referrer policy, no camera/mic/geolocation). HSTS comes from
  Vercel, not from this config; a full CSP is deferred (a wrong CSP
  breaks pages).

## Local setup

```bash
npm install
# .env.local (never committed — .env* is gitignored):
#   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
#   SUPABASE_SERVICE_ROLE_KEY=<service-role key, server only>
#   GAME_CREDS_KEY=<base64 of 32 random bytes, server only>
npm run dev        # http://localhost:3000
```

Quality gate — all four, before any deploy:

```bash
npx tsc --noEmit
npx eslint
npm test           # vitest, mock-based only — never the live database
npm run build      # needs the env vars above (dummies work for build)
```

## Supabase setup

1. Create the project in `ap-south-1`.
2. Run `supabase/migrations/0001` → `0021` **in order** in the SQL
   Editor (Run applies; Save is optional — it only stores the query
   text). The "destructive operations" warning on some migrations is
   expected.
3. Buckets: `screenshots` (private, signed URLs), `game-icons`
   (public), `brand-logos` (public).
4. Create the first super-admin row in `admin_users`
   (role `super_admin`, `is_active` true); agents are managed at
   `/admin/agents` with per-agent permission toggles
   (`player_block`, `chat_clear`, `player_delete`,
   `shortcuts_manage`).
5. Google sign-in is **not** enabled in Supabase — the login pages
   fall back to email/password.

## Deploy

Connected to Vercel from GitHub (`main`). `vercel.json` pins
functions to `bom1`. Notes from experience:

- The Hobby build quota **fills and empties** — it is not a hard 24 h
  lock. Never spam pushes during a limit window; batch work into one
  commit.
- After every deploy, hard-refresh open tabs (Ctrl+Shift+R): a tab
  left open from an older build throws
  "Server Action … was not found" until refreshed.

## Commit workflow (read before pushing)

The local clone's git history is **not** a faithful copy of remote
history, so history is never rewritten or force-pushed from here.
All pushes go through the **GitHub API (Git Data API) with an
explicit file list**: get ref → get commit/tree → post tree → post
commit → patch ref. Rules:

- Never `git add -A`, never `sync_repo.py`, never rapid per-file
  pushes (that tripped the Hobby build limit once).
- One focused commit per change, clear message, no secrets and no
  `.env` in any commit.
- Verify the push by reading the commit back from the API, and poll
  the commit status until the `Vercel` context is `success` before
  calling anything live.
- **GitHub `main` is the source of truth.** The annotated tag `v1`
  (Build 64) is the restore point for the pre-v2 site.

## Tests

`npm test` — vitest, include patterns
`src/lib/__tests__/**/*.test.ts` and
`src/app/**/__tests__/**/*.test.ts`. Tests are **mock-based only**:
real players' money moves through the deposit path, so no test ever
touches the live database. Never delete or weaken a failing test —
fix the code or the stale setup, and say so.

## Scale + known limits

Designed for 10,000 total players, 50–100 new/day, 5–10 concurrent
normally, with an ads peak of 500 new/day and 80–100 concurrent.
Runtime load holds at that peak; the binding constraints are the
Realtime ~200-connection free-plan ceiling (degrades gracefully to
polling) and storage growth (screenshots are retained 30 days, then
swept). Residual risks, stated plainly:

- An active staff JWT can still bulk-read chats/deposits via
  PostgREST (admin Realtime needs those policies; full closure needs
  a broadcast-based Realtime redesign).
- Screenshots uploaded before the retention system existed, if any,
  are not enumerated — review the buckets manually once.
- A process crash during the ~1 s human-pacing beat in account
  delivery can still orphan a `creating` account; it is visible in
  the panel for manual recovery.

## Docs

The change-by-change build log and the Phase 0 audit report are kept
in the operator's workspace next to this checkout (not committed to
the repo): `../BUILD_LOG.md` — every change, in order, replayable;
`../v2-audit/REPORT.md` — every audit finding, its fix, and what was
deliberately left open.
