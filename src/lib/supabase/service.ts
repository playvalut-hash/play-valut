import { createClient } from "@supabase/supabase-js";

/*
 * ── GUARD ──────────────────────────────────────────────────────────────────
 * This module holds the SUPABASE_SERVICE_ROLE_KEY and bypasses RLS.
 *
 *  • Import it ONLY in Server Actions / Route Handlers / admin layout code
 *    (files that never ship to the browser).
 *  • NEVER import it from a client component ("use client") or any file
 *    under the player app that is bundled for the browser.
 *  • Every admin server action that uses this client must log
 *    admin_users.id + action for audit (see Phase 1 PRD §5.2).
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * Privileged service-role client. Bypasses RLS — server-only.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
