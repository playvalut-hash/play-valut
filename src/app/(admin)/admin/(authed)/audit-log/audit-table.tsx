"use client";

import { useMemo, useState } from "react";

import type { AdminInfo, AuditLogRow } from "../../../_actions";
import { getAuditLog } from "../../../_actions";

/** Audit Log: newest-first table of admin actions + load more. */
export default function AuditTable({
  admin,
  initialRows,
}: {
  admin: AdminInfo;
  initialRows: AuditLogRow[];
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AuditLogRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialRows.length >= 50);
  const [loadingMore, setLoadingMore] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.action.toLowerCase().includes(q) ||
        r.adminName.toLowerCase().includes(q) ||
        (r.detail ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await getAuditLog(admin.id, { offset: rows.length });
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...next.filter((r) => !seen.has(r.id))];
      });
      setHasMore(next.length >= 50);
    } catch {
      // keep current list on transient errors
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="admin-thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-text-primary">Audit Log</h1>
        <p className="mt-1 text-xs text-text-secondary">
          Every admin action, newest first. Entries appear here once
          migration 0017 has run.
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search action, admin or detail…"
          className="admin-focus mt-3 w-full max-w-md rounded-md border border-surface-border bg-surface-card px-3 py-2 text-xs text-text-primary placeholder:text-text-muted"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-text-muted">
          {rows.length === 0 ? "No audit entries yet." : "No entries match this search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-surface-border bg-surface-card text-text-secondary">
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">Admin</th>
                <th className="px-3 py-2 font-semibold">Action</th>
                <th className="px-3 py-2 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-surface-border/50 last:border-0"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">
                    {r.adminName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-gold">
                    {r.action}
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-text-secondary">
                    {r.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="admin-focus mt-3 w-full rounded-md border border-surface-border bg-surface-card py-2 text-xs font-semibold text-text-primary transition hover:text-gold disabled:opacity-40"
        >
          {loadingMore ? "Loading…" : "Load more entries"}
        </button>
      )}
    </div>
  );
}
