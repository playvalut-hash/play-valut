"use client";

import { useState } from "react";
import { CheckIcon, TagIcon } from "@/components/icons";

const STORAGE_KEY = "pv_promo";
const PROMO_RE = /^[A-Za-z0-9-]{4,16}$/;

/**
 * Promo code: validates the format and persists the "applied" state locally.
 * Reward redemption is Phase 2 — this never claims to grant anything.
 */
export default function PromoForm() {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && PROMO_RE.test(saved) ? saved : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!PROMO_RE.test(value)) {
      setError("Codes are 4–16 letters, numbers or dashes.");
      return;
    }
    setError(null);
    setApplied(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
    setCode("");
  }

  function clear() {
    setApplied(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  if (applied) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-success">
          <CheckIcon className="h-5 w-5" />
          Code applied
        </p>
        <p className="mt-2 font-mono text-lg font-extrabold tracking-widest text-text-primary">
          {applied}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Show this code in chat and support will apply it to your account.
        </p>
        <button
          type="button"
          onClick={clear}
          className="mt-3 text-xs font-semibold text-text-secondary hover:text-text-primary transition"
        >
          Remove code
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={apply}
      className="rounded-2xl border border-surface-border bg-surface-card p-5"
    >
      <label className="flex items-center gap-3 rounded-xl border border-gold/50 bg-surface-input px-4 py-3.5 focus-within:border-gold transition">
        <TagIcon className="h-5 w-5 shrink-0 text-gold" />
        <span className="sr-only">Promo code</span>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter promo code"
          autoComplete="off"
          className="w-full bg-transparent font-mono text-base font-bold uppercase tracking-widest text-text-primary placeholder:text-text-muted placeholder:normal-case placeholder:tracking-normal placeholder:font-normal focus:outline-none"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="mt-3 w-full rounded-xl bg-gold py-3.5 text-sm font-bold text-black transition hover:brightness-110 min-h-[48px]"
      >
        Apply code
      </button>
      <p className="mt-2 text-xs text-text-muted">
        Got a code from a promo? Apply it here, then mention it in chat and
        support will honor it.
      </p>
    </form>
  );
}
