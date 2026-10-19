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
      .select("brand_name, logo_path, signin_heading, signin_subtext")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return FALLBACK_BRANDING;
    const row = data as unknown as Partial<Branding>;
    return {
      brand_name: row.brand_name ?? FALLBACK_BRANDING.brand_name,
      logo_path: row.logo_path ?? null,
      signin_heading: row.signin_heading ?? FALLBACK_BRANDING.signin_heading,
      signin_subtext: row.signin_subtext ?? FALLBACK_BRANDING.signin_subtext,
    };
  } catch {
    return FALLBACK_BRANDING;
  }
}
