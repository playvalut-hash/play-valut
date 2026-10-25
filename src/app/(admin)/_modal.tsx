"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Centered popup overlay for admin add/edit forms. The old inline
 *  top-of-page form opened above the viewport, so admins could not
 *  tell it had opened at all. The popup is always in view: backdrop
 *  click, Escape and the form's own close/cancel all dismiss it, and
 *  body scroll locks while it is open. The panel itself is chromeless
 *  — the form inside already renders its own card. */
export default function AdminModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  // The close callback is read through a ref so the setup effect below
  // runs exactly once (managers pass a fresh arrow each render).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl">
        {children}
      </div>
    </div>
  );
}
