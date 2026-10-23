"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { XIcon } from "@/components/icons";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * Full-screen image viewer (deposit screenshots, chat attachments).
 *
 * Verification-friendly (Build 53): mouse-wheel zoom (anchored at the
 * cursor), double-click to zoom in/out, drag to move the image around,
 * pinch on touch, and on-screen − / % / + controls.
 */
export default function ScreenshotViewer({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption?: string | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number } | null>(null);
  const movedRef = useRef(false);
  const stateRef = useRef({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    stateRef.current = { scale, x: offset.x, y: offset.y };
  }, [scale, offset]);

  // Fresh image → start fitted & centered (render-time prop adjustment).
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

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

  function clampOffset(x: number, y: number) {
    const limit = 1200;
    return {
      x: Math.max(-limit, Math.min(limit, x)),
      y: Math.max(-limit, Math.min(limit, y)),
    };
  }

  /** Zoom to nextScale keeping the stage point (px,py rel. to center) fixed. */
  function zoomAt(px: number, py: number, nextScale: number) {
    const { scale: s, x, y } = stateRef.current;
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    if (clamped === s) return;
    // Image point currently under (px,py):
    const ix = (px - x) / s;
    const iy = (py - y) / s;
    const nx = px - ix * clamped;
    const ny = py - iy * clamped;
    setScale(clamped);
    setOffset(clamped === 1 ? { x: 0, y: 0 } : clampOffset(nx, ny));
  }

  function stagePoint(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }

  // Wheel zoom — native listener so preventDefault actually works.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(px, py, stateRef.current.scale * factor);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function onDoubleClick(e: React.MouseEvent) {
    const p = stagePoint(e.clientX, e.clientY);
    if (stateRef.current.scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      zoomAt(p.x, p.y, 2.75);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;
    if (pointersRef.current.size === 1) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: stateRef.current.x,
        oy: stateRef.current.y,
      };
      setDragging(true);
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      dragStartRef.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const ratio = dist / Math.max(1, pinchRef.current.dist);
      pinchRef.current = { dist };
      if (ratio !== 1) zoomAt(mid.x, mid.y, stateRef.current.scale * ratio);
      movedRef.current = true;
      return;
    }

    const start = dragStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
    if (stateRef.current.scale > 1) {
      setOffset(clampOffset(start.ox + dx, start.oy + dy));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      setDragging(false);
    }
  }

  function stepZoom(factor: number) {
    zoomAt(0, 0, stateRef.current.scale * factor);
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  // Portals need document.body — never rendered during SSR.
  if (typeof document === "undefined") return null;

  const zoomed = scale > 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      onClick={() => {
        // A drag/pan must never close the viewer.
        if (!movedRef.current) onClose();
      }}
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
        ref={stageRef}
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden p-4"
        style={{ cursor: zoomed ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption ?? "Deposit screenshot"}
          draggable={false}
          className="max-h-full max-w-full select-none rounded-lg object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        />
      </div>

      {/* Zoom controls */}
      <div
        className="flex items-center justify-center gap-1.5 pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => stepZoom(1 / 1.4)}
          disabled={!zoomed}
          aria-label="Zoom out"
          className="admin-focus flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg font-bold text-white transition hover:bg-white/20 disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label="Reset zoom"
          className="admin-focus h-9 min-w-16 rounded-full border border-white/25 bg-white/10 px-3 text-[12px] font-bold text-white transition hover:bg-white/20"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => stepZoom(1.4)}
          aria-label="Zoom in"
          className="admin-focus flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg font-bold text-white transition hover:bg-white/20"
        >
          +
        </button>
        <span className="ml-2 hidden text-[11px] text-white/50 sm:block">
          Scroll to zoom · double-click · drag to move
        </span>
      </div>
    </div>,
    document.body,
  );
}
