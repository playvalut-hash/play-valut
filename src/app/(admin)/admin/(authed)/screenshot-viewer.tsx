"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { XIcon } from "@/components/icons";

/** Full-screen image viewer (deposit screenshots, chat attachments). */
export default function ScreenshotViewer({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Portals need document.body — never rendered during SSR.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-3">
        <span className="truncate text-xs text-text-secondary">
          {caption ?? "Screenshot"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close viewer"
          className="admin-focus rounded-md p-2 text-text-primary hover:bg-white/10"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption ?? "Deposit screenshot"}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    </div>,
    document.body,
  );
}
