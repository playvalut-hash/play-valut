"use client";

import { useState } from "react";

import { submitContactMessage } from "./_contact-actions";

/** Public contact form. Sends into contact_messages (migration 0032),
 *  which the super-admin dashboard lists — so a message sent here is
 *  actually seen, not mailed into a void. No captcha: the table is
 *  write-only from the server action and length-limited. */
export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await submitContactMessage({ name, email, message });
      if (!res.ok) {
        setError(res.error);
      } else {
        setSent(true);
      }
    } catch {
      setError("Couldn't send your message — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-5 py-4 text-sm leading-relaxed text-[#d4af37]">
        Message sent — thank you. Support will get back to you at the
        email you gave.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {error && (
        <div className="rounded-xl border border-[#ff6b5e]/40 bg-[#ff6b5e]/10 px-4 py-3 text-sm text-[#ff6b5e]">
          {error}
        </div>
      )}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        autoComplete="name"
        className="w-full rounded-xl border px-4 py-3 text-[15px] outline-none placeholder:text-[#6d7a8f]"
        style={{ background: "#151a26", borderColor: "#232c3e", color: "#eef2f7" }}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        aria-label="Your email"
        autoComplete="email"
        className="w-full rounded-xl border px-4 py-3 text-[15px] outline-none placeholder:text-[#6d7a8f]"
        style={{ background: "#151a26", borderColor: "#232c3e", color: "#eef2f7" }}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="How can we help? (10–1000 characters)"
        aria-label="Message"
        rows={4}
        className="w-full resize-y rounded-xl border px-4 py-3 text-[15px] outline-none placeholder:text-[#6d7a8f]"
        style={{ background: "#151a26", borderColor: "#232c3e", color: "#eef2f7" }}
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl py-3.5 text-[15px] font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        style={{ background: "#d4af37", color: "#241a02" }}
      >
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
