"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/** Marketing-page guest entry (same anonymous session as the login
 *  page's guest button). A guest session IS a session, so the proxy
 *  lets it straight into /app — games and chat open without any
 *  account. Fails soft with a notice until anonymous sign-ins are
 *  enabled in the Supabase dashboard. */
export default function GuestLink() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  async function handleGuest() {
    setNotice(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setNotice("Guest sign-in isn't enabled yet — sign in or create an account.");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setNotice("Guest sign-in isn't enabled yet — sign in or create an account.");
    }
  }

  return (
    <span className="mt-3 block">
      <button
        type="button"
        onClick={handleGuest}
        className="text-sm font-semibold text-[#d4af37] hover:underline"
      >
        or continue as guest
      </button>
      {notice ? <span className="mt-1 block text-xs text-[#d4af37]">{notice}</span> : null}
    </span>
  );
}
