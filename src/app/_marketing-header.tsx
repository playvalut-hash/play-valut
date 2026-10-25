"use client";

import { useState } from "react";
import Link from "next/link";

/** Public site header: sticky, with anchor navigation to every
 *  section of the one-page site. On mobile the links collapse behind
 *  a menu button (this is a client component for that toggle only —
 *  the anchors themselves work without JavaScript). No admin link
 *  anywhere here — the player side never links to the admin app. */
const NAV = [
  { href: "#home", label: "Home" },
  { href: "#games", label: "Games" },
  { href: "#how", label: "How it works" },
  { href: "#deposits", label: "Deposits" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export default function MarketingHeader({ brand }: { brand: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#232c3e] bg-[#0b0e14]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="#home" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 text-sm font-bold text-[#d4af37]">
            {brand.charAt(0) || "P"}
          </span>
          <span className="text-[15px] font-bold tracking-wide">{brand}</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Site">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[#a7b2c3] transition hover:text-[#eef2f7]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <span className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-bold text-[#241a02] transition hover:brightness-110"
            style={{ background: "#d4af37" }}
          >
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="rounded-lg border border-[#232c3e] px-3 py-2 text-sm font-bold text-[#eef2f7] md:hidden"
          >
            ☰
          </button>
        </span>
      </div>

      {open && (
        <nav
          className="border-t border-[#232c3e] px-5 py-3 md:hidden"
          aria-label="Site"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-2.5 text-sm font-medium text-[#a7b2c3] hover:bg-[#151a26] hover:text-[#eef2f7]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
