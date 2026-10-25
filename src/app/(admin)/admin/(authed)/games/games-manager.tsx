"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminInfo, GameFormData, GameRow } from "../../../_actions";
import {
  clearCustomGameIcon,
  deleteGame,
  upsertGame,
  uploadGameIcon,
} from "../../../_actions";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  EditIcon,
  ImageIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";

const EMPTY: GameFormData = {
  id: "",
  name: "",
  category: "",
  link: "",
  webLink: "",
  access: "both",
  firstBonusPct: 0,
  regBonusPct: 0,
  sortOrder: 0,
  isActive: true,
};

function GameForm({
  initial,
  onDone,
  onCancel,
  admin,
}: {
  initial: GameRow | null;
  onDone: () => void;
  onCancel: () => void;
  admin: AdminInfo;
}) {
  const router = useRouter();
  const [form, setForm] = useState<GameFormData>(
    initial
      ? {
          id: initial.id,
          name: initial.name,
          category: initial.category ?? "",
          link: initial.link ?? "",
          webLink: initial.webLink ?? "",
          access: initial.access,
          firstBonusPct: initial.firstBonusPct,
          regBonusPct: initial.regBonusPct,
          minLoad: initial.minLoad ? Number(initial.minLoad) : undefined,
          maxLoad: initial.maxLoad ? Number(initial.maxLoad) : undefined,
          redeemInfo: initial.redeemInfo ?? "",
          sortOrder: initial.sortOrder,
          isActive: initial.isActive,
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  function set<K extends keyof GameFormData>(key: K, value: GameFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await upsertGame(admin.id, form);
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save game");
      setBusy(false);
    }
  }

  async function onIconFile(file: File | undefined) {
    if (!file || !initial) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("gameId", initial.id);
      fd.set("file", file);
      await uploadGameIcon(admin.id, fd);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload icon");
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveIcon() {
    if (!initial) return;
    setUploading(true);
    setError(null);
    try {
      await clearCustomGameIcon(admin.id, initial.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove icon");
    } finally {
      setUploading(false);
    }
  }

  const inputCls =
    "admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted disabled:opacity-50";
  const labelCls = "mb-1 block text-[11px] font-medium text-text-secondary";

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {initial ? `Edit ${initial.name}` : "Add game"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close form"
          className="admin-focus rounded p-1 text-text-muted hover:text-text-primary"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-1">
          <span className={labelCls}>ID (slug)</span>
          <input
            value={form.id}
            disabled={!!initial}
            onChange={(e) => set("id", e.target.value)}
            placeholder="juwa-777"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Name</span>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Juwa 777"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Category</span>
          <input
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="Fish Arcade"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Play options</span>
          <select
            value={form.access}
            onChange={(e) => set("access", e.target.value as GameFormData["access"])}
            className={inputCls}
          >
            <option value="both">App + Web</option>
            <option value="app">App only</option>
            <option value="web">Web only</option>
          </select>
        </label>
        <label className="col-span-2">
          <span className={labelCls}>Official download / app link</span>
          <input
            value={form.link}
            onChange={(e) => set("link", e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </label>
        <label className="col-span-2">
          <span className={labelCls}>Web play link (optional)</span>
          <input
            value={form.webLink}
            onChange={(e) => set("webLink", e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Signup bonus %</span>
          <input
            type="number"
            min={0}
            value={form.firstBonusPct}
            onChange={(e) => set("firstBonusPct", Number(e.target.value))}
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Reload bonus %</span>
          <input
            type="number"
            min={0}
            value={form.regBonusPct}
            onChange={(e) => set("regBonusPct", Number(e.target.value))}
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Min load ($)</span>
          <input
            type="number"
            min={0}
            value={form.minLoad ?? ""}
            onChange={(e) =>
              set("minLoad", e.target.value === "" ? undefined : Number(e.target.value))
            }
            placeholder="1"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Max load ($)</span>
          <input
            type="number"
            min={0}
            value={form.maxLoad ?? ""}
            onChange={(e) =>
              set("maxLoad", e.target.value === "" ? undefined : Number(e.target.value))
            }
            placeholder="5000"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Redeem info</span>
          <input
            value={form.redeemInfo}
            onChange={(e) => set("redeemInfo", e.target.value)}
            placeholder="3×"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Sort order</span>
          <input
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", Number(e.target.value))}
            className={inputCls}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-[13px] text-text-secondary">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="h-4 w-4 accent-[#d4af37]"
          />
          Visible to players
        </label>
      </div>

      {initial && (
        <div className="mt-3 flex items-center gap-2 border-t border-surface-border pt-3">
          {initial.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={initial.iconUrl} alt="" className="h-9 w-9 rounded object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded bg-surface-elevated text-text-muted">
              <ImageIcon className="h-4 w-4" />
            </span>
          )}
          <label className="cursor-pointer rounded-md border border-surface-border px-2.5 py-1.5 text-xs text-text-secondary hover:text-gold">
            {uploading ? "Uploading…" : "Upload icon"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                void onIconFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {initial.hasCustomIcon && (
            <button
              type="button"
              onClick={() => void onRemoveIcon()}
              disabled={uploading}
              className="admin-focus rounded-md border border-danger/40 px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {uploading ? "Removing…" : "Remove icon"}
            </button>
          )}
        </div>
      )}
      {initial?.hasCustomIcon && (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
          Custom icon set — removing it restores the original artwork
          {initial.originalIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={initial.originalIconUrl}
              alt="Original artwork"
              className="h-6 w-6 rounded object-cover"
            />
          ) : null}
          everywhere (player + admin).
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="admin-focus rounded-md bg-gold px-4 py-2 text-[13px] font-semibold text-navy hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save game"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="admin-focus rounded-md border border-surface-border px-4 py-2 text-[13px] text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Games Library: table + add/edit form + guarded delete + icon upload. */
export default function GamesManager({
  admin,
  games,
}: {
  admin: AdminInfo;
  games: GameRow[];
}) {
  const router = useRouter();
  const [formFor, setFormFor] = useState<GameRow | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function doDelete(game: GameRow) {
    setDeleteError(null);
    try {
      await deleteGame(admin.id, game.id);
      setConfirmId(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete game");
      setConfirmId(null);
    }
  }

  return (
    <div className="admin-thin-scroll h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Games Library</h1>
          <p className="text-xs text-text-muted">
            {games.length} games · this list feeds the player lobby, chat and SEND bar
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormFor("new")}
          className="admin-focus flex items-center gap-1.5 rounded-md bg-gold px-3 py-2 text-[13px] font-semibold text-navy hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" /> Add game
        </button>
      </div>

      {deleteError && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {deleteError}
        </div>
      )}

      {formFor && (
        <div className="mb-4 max-w-2xl">
          <GameForm
            initial={formFor === "new" ? null : formFor}
            admin={admin}
            onDone={() => setFormFor(null)}
            onCancel={() => setFormFor(null)}
          />
        </div>
      )}

      {/* Card grid — same format as Payment Methods (Build 60) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <div
            key={g.id}
            className={cn(
              "admin-lift rounded-lg border border-surface-border bg-surface-card p-4",
              !g.isActive && "opacity-60",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {g.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.iconUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-elevated text-text-muted">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                )}
                <div>
                  <p className="text-sm font-semibold text-text-primary">{g.name}</p>
                  <p className="font-mono text-[10px] text-text-muted">{g.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFormFor(g)}
                  aria-label={`Edit ${g.name}`}
                  className="admin-focus rounded p-1.5 text-text-muted hover:text-gold"
                >
                  <EditIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmId === g.id) void doDelete(g);
                    else {
                      setConfirmId(g.id);
                      setTimeout(() => setConfirmId((c) => (c === g.id ? null : c)), 3000);
                    }
                  }}
                  aria-label={confirmId === g.id ? "Confirm delete" : `Delete ${g.name}`}
                  className={cn(
                    "admin-focus rounded px-1.5 py-1 text-[11px] font-medium",
                    confirmId === g.id
                      ? "bg-danger/15 text-danger"
                      : "text-text-muted hover:text-danger",
                  )}
                >
                  {confirmId === g.id ? "Confirm?" : <TrashIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Access</dt>
                <dd className="text-text-primary">
                  {g.access === "both"
                    ? "App + Web"
                    : g.access === "app"
                      ? "App only"
                      : "Web only"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Signup / Reload</dt>
                <dd className="text-text-primary">
                  +{g.firstBonusPct}% / +{g.regBonusPct}%
                </dd>
              </div>
              {(g.minLoad != null || g.maxLoad != null) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Load range</dt>
                  <dd className="text-text-primary">
                    ${g.minLoad ?? "?"} – ${g.maxLoad ?? "?"}
                  </dd>
                </div>
              )}
              {g.category && (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Category</dt>
                  <dd className="max-w-[60%] text-right text-text-secondary">{g.category}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Order</dt>
                <dd className="text-text-primary">{g.sortOrder}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Visible</dt>
                <dd>
                  {g.isActive ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckIcon className="h-3.5 w-3.5" /> Yes
                    </span>
                  ) : (
                    <span className="text-text-muted">No</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ))}
        {games.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-surface-border px-4 py-10 text-center text-xs text-text-muted">
            No games yet — add the first one above.
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
        <ChevronDownIcon className="h-3 w-3" />
        Deleting a game is blocked while any player holds an account for it.
      </div>
    </div>
  );
}
