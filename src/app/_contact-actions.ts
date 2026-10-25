"use server";

import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/service";

/** Public contact form (migration 0032). Server-side insert only —
 *  the table has RLS enabled with no policies, so no client can read
 *  or write it directly. Validated here, so a bad payload never
 *  reaches the database. Pre-migration the table doesn't exist and
 *  the insert errors — the form then shows the honest retry message. */
const contactSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120),
  message: z.string().trim().min(10).max(1000),
});

export async function submitContactMessage(input: {
  name: string;
  email: string;
  message: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Please fill in your name, a valid email and a message (10–1000 characters).",
    };
  }
  try {
    const { error } = await createServiceClient()
      .from("contact_messages")
      .insert({
        name: parsed.data.name,
        email: parsed.data.email,
        message: parsed.data.message,
      });
    if (error) {
      return { ok: false, error: "Couldn't send your message — try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't send your message — try again." };
  }
}
