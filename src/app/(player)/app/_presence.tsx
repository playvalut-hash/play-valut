"use client";

import { useEffect } from "react";

import { touchPresence } from "./_actions";

/**
 * Presence heartbeat (Build 63): while the player app is open, stamp
 * is_online + last_seen_at every 25s (and immediately when the tab becomes
 * visible again). On tab hide/unmount, try to mark offline — the admin
 * side also ages out stale heartbeats after 75s, so a crashed tab never
 * shows "online" forever. Renders nothing.
 */
export default function PresenceHeartbeat() {
  useEffect(() => {
    const beat = () => {
      void touchPresence(true).catch(() => {});
    };
    const off = () => {
      void touchPresence(false).catch(() => {});
    };
    beat();
    const iv = setInterval(beat, 25_000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", off);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", off);
      off();
    };
  }, []);
  return null;
}
