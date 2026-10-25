"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminInfo, MethodFormData, PaymentMethodRow } from "../../../_actions";
import { deletePaymentMethod, upsertPaymentMethod } from "../../../_actions";
import { cn } from "@/lib/utils";
import AdminModal from "../../../_modal";
import {
  CardIcon,
  CheckIcon,
  EditIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { safeHref } from "@/lib/urls";

const EMPTY: MethodFormData = {
  id: "",
  name: "",
  brandColor: "",
  accountName: "",
  handle: "",
  payLink: "",
  note: "",
  sortOrder: 0,
  isActive: true,
};

function MethodForm({
  initial,
  admin,
  onDone,
  onCancel,
}: {
  initial: PaymentMethodRow | null;
  admin: AdminInfo;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<MethodFormData>(
    initial
      ? {
          id: initial.id,
          name: initial.name,
          brandColor: initial.brandColor ?? "",
          accountName: initial.accountName,
          handle: initial.handle,
          payLink: initial.payLink ?? "",
          note: initial.note ?? "",
          sortOrder: initial.sortOrder,
          isActive: initial.isActive,
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof MethodFormData>(key: K, value: MethodFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await upsertPaymentMethod(admin.id, form);
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save method");
      setBusy(false);
    }
  }

  const inputCls =
    "admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted disabled:opacity-50";
  const labelCls = "mb-1 block text-[11px] font-medium text-text-secondary";

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {initial ? `Edit ${initial.name}` : "Add payment method"}
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
            placeholder="cash-app"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Display name</span>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Cash App"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Account name</span>
          <input
            value={form.accountName}
            onChange={(e) => set("accountName", e.target.value)}
            placeholder="PlayVault Payments"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Handle</span>
          <input
            value={form.handle}
            onChange={(e) => set("handle", e.target.value)}
            placeholder="$PlayVaultPay"
            className={inputCls}
          />
        </label>
        <label className="col-span-2">
          <span className={labelCls}>Pay link (clickable for the player)</span>
          <input
            value={form.payLink}
            onChange={(e) => set("payLink", e.target.value)}
            placeholder="https://cash.app/$PlayVaultPay"
            className={inputCls}
          />
        </label>
        <label className="col-span-2">
          <span className={labelCls}>Admin note (shown to the player)</span>
          <input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Send as Friends & Family, then upload the screenshot"
            className={inputCls}
          />
        </label>
        <label className="col-span-1">
          <span className={labelCls}>Brand color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.brandColor || "#d4af37"}
              onChange={(e) => set("brandColor", e.target.value)}
              aria-label="Brand color picker"
              className="h-9 w-10 cursor-pointer rounded border border-surface-border bg-surface-input"
            />
            <input
              value={form.brandColor}
              onChange={(e) => set("brandColor", e.target.value)}
              placeholder="#d4af37"
              className={inputCls}
            />
          </div>
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

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="admin-focus rounded-md bg-gold px-4 py-2 text-[13px] font-semibold text-navy hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save method"}
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

/** Payment Methods page — one table feeding deposit picker, chat tiles and SEND bar. */
export default function MethodsManager({
  admin,
  methods,
}: {
  admin: AdminInfo;
  methods: PaymentMethodRow[];
}) {
  const router = useRouter();
  const [formFor, setFormFor] = useState<PaymentMethodRow | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function doDelete(method: PaymentMethodRow) {
    setDeleteError(null);
    try {
      await deletePaymentMethod(admin.id, method.id);
      setConfirmId(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete method");
      setConfirmId(null);
    }
  }

  return (
    <div className="admin-thin-scroll h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Payment Methods</h1>
          <p className="text-xs text-text-muted">
            The same list feeds the player deposit picker, chat tiles and the SEND bar
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormFor("new")}
          className="admin-focus flex items-center gap-1.5 rounded-md bg-gold px-3 py-2 text-[13px] font-semibold text-navy hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" /> Add method
        </button>
      </div>

      {deleteError && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {deleteError}
        </div>
      )}

      {formFor && (
        <AdminModal onClose={() => setFormFor(null)}>
          <MethodForm
            initial={formFor === "new" ? null : formFor}
            admin={admin}
            onDone={() => setFormFor(null)}
            onCancel={() => setFormFor(null)}
          />
        </AdminModal>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {methods.map((m) => (
          <div
            key={m.id}
            className={cn(
              "admin-lift rounded-lg border border-surface-border bg-surface-card p-4",
              !m.isActive && "opacity-60",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-md text-navy"
                  style={{ backgroundColor: m.brandColor ?? "#d4af37" }}
                >
                  <CardIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{m.name}</p>
                  <p className="font-mono text-[10px] text-text-muted">{m.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFormFor(m)}
                  aria-label={`Edit ${m.name}`}
                  className="admin-focus rounded p-1.5 text-text-muted hover:text-gold"
                >
                  <EditIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmId === m.id) void doDelete(m);
                    else {
                      setConfirmId(m.id);
                      setTimeout(() => setConfirmId((c) => (c === m.id ? null : c)), 3000);
                    }
                  }}
                  aria-label={confirmId === m.id ? "Confirm delete" : `Delete ${m.name}`}
                  className={cn(
                    "admin-focus rounded px-1.5 py-1 text-[11px] font-medium",
                    confirmId === m.id
                      ? "bg-danger/15 text-danger"
                      : "text-text-muted hover:text-danger",
                  )}
                >
                  {confirmId === m.id ? "Confirm?" : <TrashIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Account</dt>
                <dd className="text-text-primary">{m.accountName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Handle</dt>
                <dd className="font-mono text-text-primary">{m.handle}</dd>
              </div>
              {safeHref(m.payLink) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Pay link</dt>
                  <dd>
                    <a
                      href={safeHref(m.payLink) ?? ""}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-focus inline-flex items-center gap-1 text-gold hover:underline"
                    >
                      <LinkIcon className="h-3 w-3" /> Open
                    </a>
                  </dd>
                </div>
              )}
              {m.note && (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Note</dt>
                  <dd className="max-w-[60%] text-right text-text-secondary">{m.note}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Status</dt>
                <dd>
                  {m.isActive ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckIcon className="h-3.5 w-3.5" /> Active
                    </span>
                  ) : (
                    <span className="text-text-muted">Hidden</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ))}
        {methods.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-surface-border px-4 py-10 text-center text-xs text-text-muted">
            No payment methods yet — add the first one above.
          </p>
        )}
      </div>

      <p className="mt-3 text-[11px] text-text-muted">
        Deleting a method is blocked while any deposit references it — hide it instead.
      </p>
    </div>
  );
}
