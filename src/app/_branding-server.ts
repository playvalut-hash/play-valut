import { createClient } from "@/lib/supabase/server";
import { FALLBACK_BRANDING, type Branding } from "./_branding";

/**
 * SERVER-ONLY: fetches the single branding row (id = 1).
 * Must never be imported from a client component (uses next/headers).
 */
export async function getBranding(): Promise<Branding> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("branding")
      .select("brand_name, logo_path, signin_heading, signin_subtext, guest_mode_enabled, marketing_page_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return FALLBACK_BRANDING;
    const row = data as unknown as Partial<Branding>;
    return {
      brand_name: row.brand_name ?? FALLBACK_BRANDING.brand_name,
      logo_path: row.logo_path ?? null,
      signin_heading: row.signin_heading ?? FALLBACK_BRANDING.signin_heading,
      signin_subtext: row.signin_subtext ?? FALLBACK_BRANDING.signin_subtext,
      // Pre-migration the explicit select fails and the catch below
      // returns the fallback (guest mode on) — same as today.
      guest_mode_enabled: row.guest_mode_enabled ?? true,
      // Same pre-migration story as guest_mode_enabled (0030).
      marketing_page_enabled: row.marketing_page_enabled ?? true,
    };
  } catch {
    return FALLBACK_BRANDING;
  }
}
