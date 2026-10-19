"use client";

import { useMemo, useState } from "react";

import type { SheetLogRow } from "../../../_actions";
import { CheckIcon, CopyIcon, SearchIcon } from "@/components/icons";
import { StatusChip } from "../ui-bits";

function toTsv(rows: SheetLogRow[]): string {
  const header = ["Player", "Email", "Game", "Username", "Status", "Created"];
  const lines = rows.map((r) =>
    [r.playerName, r.playerEmail ?? "", r.gameName, r.username, r.status, r.createdAt]
      .map((cell) => cell.replace(/\t|\n|\r/g, " "))
      .join("\t"),
  );
  return [header.join("\t"), ...lines].join("\n");
}

/** Sheet Log: read-only table of every game account + copy-as-TSV. */
export default function SheetTable({ rows }: { rows: SheetLogRow[] }) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.playerName.toLowerCase().includes(q) ||
        (r.playerEmail ?? "").toLowerCase().includes(q) ||
        r.gameName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function copyTsv() {
    try {
      await navigator.clipboard.writeText(toTsv(filtered));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="admin-thin-scroll h-full overflow-y-auto p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Sheet Log</h1>
          <p className="text-xs text-text-muted">
            {rows.length} accounts · read-only · the on-screen counterpart of the
            future Google Sheet mirror
          </p>
        </div>
        <button
          type="button"
          onClick={copyTsv}
          className="admin-focus flex items-center gap-1.5 rounded-md bg-gold px-3 py-2 text-[13px] font-semibold text-navy hover:opacity-90"
        >
          {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy as TSV"}
        </button>
      </div>

      <div className="relative mb-3 max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player, game, username…"
          aria-label="Search sheet log"
          className="admin-focus w-full rounded-md border border-surface-border bg-surface-input py-2 pl-8 pr-2 text-[13px] text-text-primary placeholder:text-text-muted"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-surface-border bg-surface-card text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Game</th>
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.accountId} className="border-b border-surface-border/50 last:border-0 hover:bg-surface-card/40">
                <td className="px-3 py-2">
                  <p className="font-medium text-text-primary">{r.playerName}</p>
                  {r.playerEmail && (
                    <p className="text-[11px] text-text-muted">{r.playerEmail}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-text-secondary">{r.gameName}</td>
                <td className="px-3 py-2 font-mono text-text-primary">{r.username}</td>
                <td className="px-3 py-2">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-3 py-2 text-[11px] text-text-muted">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-text-muted">
                  {rows.length === 0 ? "No accounts yet." : "No rows match this search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
