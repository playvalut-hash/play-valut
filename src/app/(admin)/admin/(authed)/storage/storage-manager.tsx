"use client";

import { useState } from "react";

import type { AdminInfo } from "../../../_actions";
import { runStorageCleanup } from "../../../_actions";

type Result = {
  decided: number;
  chat: number;
  orphans: number;
  capped: boolean;
};

/** Manual storage cleanup (v2 Phase 1, audit H7). */
export default function StorageManager({ admin }: { admin: AdminInfo }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onRun() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runStorageCleanup(admin.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-xl">
        <h1 className="text-lg font-bold text-text-primary">Storage</h1>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          Screenshots live in the private screenshots bucket. Two rules keep
          it bounded: screenshots of deposits decided more than{" "}
          <span className="font-semibold text-text-primary">30 days</span> ago
          and chat images shared more than{" "}
          <span className="font-semibold text-text-primary">30 days</span> ago
          are deleted automatically when a deposit is decided. Pending
          deposits are never touched by the automatic sweep.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          Run cleanup below for a full pass: the 30-day rules looped to
          completion, plus orphaned screenshots left behind by older clears
          and deletes (objects with no deposit or chat message pointing at
          them). Clearing a chat already deletes its screenshots immediately
          — this button is for everything else.
        </p>

        <div className="mt-4 rounded-xl border border-surface-border bg-surface-card p-4">
          <button
            type="button"
            onClick={() => void onRun()}
            disabled={busy}
            className="admin-focus rounded-md bg-gold px-4 py-2 text-sm font-bold text-navy transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Cleaning…" : "Run cleanup"}
          </button>
          {error && (
            <p className="mt-3 text-xs font-semibold text-error">{error}</p>
          )}
          {result && (
            <div className="mt-3 space-y-1 text-xs text-text-secondary">
              <p>
                Decided-deposit screenshots deleted:{" "}
                <span className="font-semibold text-text-primary">
                  {result.decided}
                </span>
              </p>
              <p>
                Old chat images deleted:{" "}
                <span className="font-semibold text-text-primary">
                  {result.chat}
                </span>
              </p>
              <p>
                Orphaned screenshots deleted:{" "}
                <span className="font-semibold text-text-primary">
                  {result.orphans}
                </span>
              </p>
              {result.capped && (
                <p className="font-semibold text-gold">
                  The run hit its safety cap — run cleanup again to continue.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
