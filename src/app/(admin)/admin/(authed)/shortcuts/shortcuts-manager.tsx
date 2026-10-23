"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createShortcut,
  deleteShortcut,
  setShortcutEnabled,
  updateShortcut,
  type AdminInfo,
  type TextShortcut,
} from "../../../_actions";
import { cn } from "@/lib/utils";

/**
 * Text Shortcuts manager (Build 59): search + create/edit form + list with
 * enable toggles and a small delete-confirm popup (same pattern as the
 * moderation popup). Changes are saved through permission-checked server
 * actions; the list refreshes from the server after every mutation.
 */
export default function ShortcutsManager({
  admin,
  shortcuts,
  loadError,
}: {
  admin: AdminInfo;
  shortcuts: TextShortcut[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [expansion, setExpansion] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TextShortcut | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter(
      (s) =>
        s.key.toLowerCase().includes(q) ||
        s.expansion.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q),
    );
  }, [shortcuts, query]);

  function resetForm() {
    setEditingId(null);
    setKey("");
    setExpansion("");
    setDescription("");
    setError(null);
  }

  function startEdit(s: TextShortcut) {
    setEditingId(s.id);
    setKey(s.key);
    setExpansion(s.expansion);
    setDescription(s.description ?? "");
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const input = {
        key,
        expansion,
        description: description.trim() ? description : undefined,
      };
      if (editingId) await updateShortcut(admin.id, editingId, input);
      else await createShortcut(admin.id, input);
      resetForm();
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save the shortcut.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: TextShortcut) {
    try {
      await setShortcutEnabled(admin.id, s.id, !s.isEnabled);
      router.refresh();
    } catch {
      // list stays as-is; a refresh shows the true state
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <header>
        <h1 className="font-display text-xl font-extrabold text-text-primary">
          Text Shortcuts
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
          Type a shortcut and a <strong className="text-text-secondary">space</strong> in
          any player chat and it expands into the full text — e.g.{" "}
          <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[12px] text-gold">
            ty
          </code>{" "}
          → “Thank you!”. Every staff member can use the enabled shortcuts;
          only managers can change them here.
        </p>
      </header>

      {loadError && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
          The shortcuts table isn’t set up yet — the database step (migration
          0012) still needs to be run. Shortcuts won’t load or save until then.
        </div>
      )}

      {/* Create / edit form */}
      <section className="mt-5 rounded-2xl border border-surface-border bg-surface-card p-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-text-secondary">
          {editingId ? "Edit shortcut" : "Add a shortcut"}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
          <label className="block">
            <span className="text-[12px] font-semibold text-text-secondary">
              Shortcut
            </span>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ty"
              maxLength={32}
              className="admin-focus mt-1 w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 font-mono text-[13px] text-text-primary placeholder:text-text-muted"
            />
            <span className="mt-1 block text-[11px] text-text-muted">
              Letters, numbers, - or _ · no spaces
            </span>
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-text-secondary">
              Description <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Thank-you reply"
              maxLength={120}
              className="admin-focus mt-1 w-full rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-[12px] font-semibold text-text-secondary">
            Expands to
          </span>
          <textarea
            value={expansion}
            onChange={(e) => setExpansion(e.target.value)}
            placeholder="Thank you for contacting us. How can I help you today?"
            rows={3}
            maxLength={2000}
            className="admin-focus mt-1 w-full resize-y rounded-lg border border-surface-border bg-surface-input px-3 py-2 text-[13px] leading-relaxed text-text-primary placeholder:text-text-muted"
          />
        </label>
        {key.trim() && expansion.trim() && (
          <p className="mt-2 rounded-lg bg-surface-elevated px-3 py-2 text-[12px] text-text-muted">
            Preview: typing{" "}
            <code className="font-mono text-gold">{key.trim().toLowerCase()}</code>{" "}
            + space gives “{expansion.trim().slice(0, 120)}
            {expansion.trim().length > 120 ? "…" : ""}”
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[12.5px] font-medium text-red-400">
            {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy || !key.trim() || !expansion.trim()}
            className="admin-focus rounded-lg bg-gold px-4 py-2 text-[13px] font-bold text-navy transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add shortcut"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="admin-focus rounded-lg border border-surface-border px-4 py-2 text-[13px] font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel edit
            </button>
          )}
        </div>
      </section>

      {/* Search + list */}
      <div className="mt-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shortcuts…"
          aria-label="Search shortcuts"
          className="admin-focus w-full rounded-full border border-surface-border bg-surface-input px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted"
        />
        {filtered.length === 0 ? (
          <p className="mt-6 text-center text-[13px] text-text-muted">
            {shortcuts.length === 0
              ? "No shortcuts yet — add your first one above."
              : "No shortcuts match your search."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filtered.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "rounded-2xl border border-surface-border bg-surface-card px-4 py-3",
                  !s.isEnabled && "opacity-55",
                )}
              >
                <div className="flex items-start gap-3">
                  <code className="mt-0.5 shrink-0 rounded-md bg-gold/15 px-2 py-1 font-mono text-[12.5px] font-bold text-gold">
                    {s.key}
                  </code>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">
                      {s.expansion}
                    </p>
                    {s.description && (
                      <p className="mt-0.5 text-[11.5px] text-text-muted">
                        {s.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2 pl-1">
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    aria-pressed={s.isEnabled}
                    className={cn(
                      "admin-focus rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                      s.isEnabled
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-surface-elevated text-text-muted",
                    )}
                  >
                    {s.isEnabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="admin-focus rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-text-secondary hover:text-text-primary"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(s)}
                    className="admin-focus rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete confirmation (small popup, Build 44 pattern) */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold text-text-primary">
              Delete this shortcut?
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              “{pendingDelete.key}” will stop expanding in chats for every
              staff member. This can’t be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="admin-focus flex-1 rounded-lg border border-surface-border px-3 py-2.5 text-[13px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  setBusy(true);
                  try {
                    await deleteShortcut(admin.id, target.id);
                    if (editingId === target.id) resetForm();
                    router.refresh();
                  } catch {
                    // refresh shows the true state
                  } finally {
                    setBusy(false);
                  }
                }}
                className="admin-focus flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
              >
                Delete shortcut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
