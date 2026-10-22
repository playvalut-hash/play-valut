"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

export default function SignupForm({ branding }: { branding: { brand_name: string } }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim() || !email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        router.push("/app");
        router.refresh();
      } else {
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  const fieldStyle = {
    background: "#151a26",
    borderColor: "#232c3e",
    color: "#eef2f7",
  } as const;

  return (
    <div className="flex min-h-dvh flex-col px-[26px] pb-10 pt-[52px]" style={{ background: "#0b0e14" }}>
      <div className="mx-auto mb-[14px] grid h-[84px] w-[84px] place-items-center rounded-[22px] text-gold"
        style={{ background: "linear-gradient(145deg, #123524, #0a2317)", border: "1px solid rgba(212, 175, 55, 0.45)" }} aria-hidden>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 21 12 12 22 3 12 12 2Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7.5 16.5 12 12 16.5 7.5 12 12 7.5Z" fill="currentColor" />
        </svg>
      </div>
      <div className="text-center text-[26px] font-extrabold tracking-[0.06em]"
        style={{ fontFamily: "var(--font-display)", color: "#eef2f7" }}>
        PLAY<span className="text-gold">VAULT</span>
      </div>

      <div className="mx-auto mt-8 w-full max-w-[400px]">
        <h1 className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-display)", color: "#eef2f7" }}>
          Create Account
        </h1>
        <p className="mt-1 text-[15px]" style={{ color: "#a7b2c3" }}>
          Join the lobby — it takes a minute
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-[#ff6b5e]/40 bg-[#ff6b5e]/10 px-4 py-3 text-sm text-[#ff6b5e]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSignup} className="mt-6">
          {[
            { id: "suName", label: "Full name", type: "text", value: displayName, set: setDisplayName, ph: "e.g. Alex Morgan" },
            { id: "suEmail", label: "Email", type: "email", value: email, set: setEmail, ph: "you@example.com" },
          ].map((f) => (
            <div key={f.id} className="mb-[14px] flex flex-col gap-[6px]">
              <label htmlFor={f.id} className="text-[13px] font-semibold" style={{ color: "#a7b2c3" }}>{f.label}</label>
              <input id={f.id} type={f.type} value={f.value} onChange={(e) => f.set(e.target.value)}
                placeholder={f.ph} style={fieldStyle}
                className="rounded-[12px] border px-4 py-3 text-[15px] outline-none transition focus:border-gold" />
            </div>
          ))}
          <div className="mb-[14px] flex flex-col gap-[6px]">
            <label htmlFor="suPass" className="text-[13px] font-semibold" style={{ color: "#a7b2c3" }}>Password</label>
            <div className="relative">
              <input id="suPass" type={showPassword ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" style={fieldStyle}
                className="w-full rounded-[12px] border px-4 py-3 pr-12 text-[15px] outline-none transition focus:border-gold" />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: "#6d7a8f" }}
                aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="mt-2 w-full rounded-[12px] py-[14px] text-[16px] font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            style={{ background: "#d4af37", color: "#241a02" }}>
            {loading ? "Creating…" : "Create my account"}
          </button>
        </form>

        <p className="mt-6 text-center text-[14px]" style={{ color: "#a7b2c3" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-gold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
