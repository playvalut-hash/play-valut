import { createClient } from "@/lib/supabase/server";

/**
 * Session binding (v2 Phase 1, audit C1).
 *
 * The ONLY trusted source of "who is calling" is the signed-in session.
 * Server actions must never trust an id that arrived from the client
 * without comparing it to this value — before this module, requireAdmin()
 * only checked that a passed id existed and was active, so any staff
 * session could act as any admin whose UUID it knew.
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Throws unless the signed-in user IS the given admin id. */
export async function assertSessionMatches(adminId: string): Promise<void> {
  const sessionId = await getSessionUserId();
  if (!sessionId || sessionId !== adminId) {
    throw new Error("Not authorized");
  }
}
