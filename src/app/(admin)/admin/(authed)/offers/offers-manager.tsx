"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminInfo, OfferRow } from "../../../_actions";
import {
  createOffer,
  deleteOffer,
  setTickerEnabled,
  updateOffer,
} from "../../../_actions";
import AdminModal from "../../../_modal";
import { cn } from "@/lib/utils";
import {
  EditIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";

function OfferForm({
  initial,
  admin,
  onDone,
  onCancel,
}: {
  initial: OfferRow | null;
  admin: AdminInfo;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [sortOrder, setSortOrder] = useState(
    initial ? String(initial.sort_order) : "0",
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputCls =
    "admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted disabled:opacity-50";
  const labelCls = "mb-1 block text-[11px] font-medium text-text-secondary";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = initial
        ? await updateOffer(admin.id, initial.id, {
            text,
            sortOrder: Number(sortOrder) || 0,
            isActive,
          })
        : await createOffer(admin.id, {
            text,
            sortOrder: Number(sortOrder) || 0,
            isActive,
          });
      if (!res.ok) {
        setError(res.error);
      } else {
        onDone();
      }
    } catch {
      setError("Could not save the offer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-surface-border bg-surface-card p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {initial ? "Edit offer" : "Add offer"}
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
        <div
          role="alert"
          className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}

      <label className="block">
        <span className={labelCls}>Offer text (max 120 characters)</span>
        <input
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. 90% bonus for the next 10 minutes!"
          className={inputCls}
        />
        <span className="mt-1 block text-right text-[11px] text-text-muted">
          {text.length}/120
        </span>
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>Order (lowest shows first)</span>
          <input
            type="number"
            min={0}
            max={999}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex items-end gap-2 pb-1.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="admin-focus h-4 w-4 accent-[#D4AF37]"
          />
          <span className="text-[13px] text-text-primary">Active</span>
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="admin-focus rounded-md border border-surface-border px-3 py-1.5 text-[13px] text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="admin-focus rounded-md bg-gold px-3 py-1.5 text-[13px] font-semibold text-navy hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save offer" : "Add offer"}
        </button>
      </div>
    </form>
  );
}

/** Offers: ticker lines + global switch + plain-English instructions. */
export default function OffersManager({
  admin,
  offers,
  needsMigration,
  tickerEnabled,
}: {
  admin: AdminInfo;
  offers: OfferRow[];
  needsMigration: boolean;
  tickerEnabled: boolean;
}) {
  const router = useRouter();
  const [formFor, setFormFor] = useState<OfferRow | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  async function doDelete(offer: OfferRow) {
    setActionError(null);
    const res = await deleteOffer(admin.id, offer.id);
    if (!res.ok) {
      setActionError(res.error);
    } else {
      setConfirmId(null);
      router.refresh();
    }
  }

  async function doToggleActive(offer: OfferRow) {
    setActionError(null);
    const res = await updateOffer(admin.id, offer.id, {
      text: offer.text,
      sortOrder: offer.sort_order,
      isActive: !offer.is_active,
    });
    if (!res.ok) setActionError(res.error);
    else router.refresh();
  }

  async function doToggleTicker() {
    setActionError(null);
    setToggling(true);
    try {
      const res = await setTickerEnabled(admin.id, !tickerEnabled);
      if (!res.ok) setActionError(res.error);
      else router.refresh();
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="admin-thin-scroll h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Offers</h1>
          <p className="text-xs text-text-muted">
            {offers.length} offer{offers.length === 1 ? "" : "s"} · every
            player sees the active ones in the ticker
          </p>
        </div>
        <button
          type="button"
          disabled={needsMigration}
          onClick={() => setFormFor("new")}
          className="admin-focus flex items-center gap-1.5 rounded-md bg-gold px-3 py-2 text-[13px] font-semibold text-navy hover:opacity-90 disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" /> Add offer
        </button>
      </div>

      {needsMigration && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          Offers need migration 0026 — please run it in the SQL Editor
          first. Adding offers is disabled until then.
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {actionError}
        </div>
      )}

      {/* Global switch */}
      <div className="mb-3 flex items-center justify-between rounded-lg border border-surface-border bg-surface-card px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Ticker {tickerEnabled ? "on" : "off"}
          </p>
          <p className="text-xs text-text-secondary">
            Off hides the whole ticker — the mobile top bar and the
            desktop right rail disappear for every player, even with
            offers saved.
          </p>
        </div>
        <button
          type="button"
          disabled={toggling || needsMigration}
          onClick={() => void doToggleTicker()}
          role="switch"
          aria-checked={tickerEnabled}
          className={cn(
            "admin-focus relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
            tickerEnabled ? "bg-gold" : "bg-surface-elevated",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
              tickerEnabled ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      {/* Plain-English instructions */}
      <div className="mb-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-text-secondary">
        <p className="font-semibold text-text-primary">
          How offers reach players
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>
            Every <strong className="text-text-primary">active</strong>{" "}
            offer shows to <strong className="text-text-primary">all
            players</strong>, one after another, in a slow loop — even a
            single offer keeps running on its own.
          </li>
          <li>
            Desktop: a rail on the right side of the player site, offers
            drifting bottom-to-top like live comments. Mobile: a bar at
            the very top, scrolling right-to-left like a news ticker —
            it stays above the support chat too.
          </li>
          <li>
            <strong className="text-text-primary">Order</strong> decides
            the sequence (lowest first); equal orders run oldest first.
            Short text works best — under 60 characters reads instantly
            on the mobile bar.
          </li>
          <li>
            Pause one offer without deleting it with its Active button;
            turn the whole ticker off with the switch above. A new or
            edited offer appears on each player&apos;s next page load.
          </li>
        </ul>
      </div>

      {formFor && (
        <AdminModal onClose={() => setFormFor(null)}>
          <OfferForm
            initial={formFor === "new" ? null : formFor}
            admin={admin}
            onDone={() => {
              setFormFor(null);
              router.refresh();
            }}
            onCancel={() => setFormFor(null)}
          />
        </AdminModal>
      )}

      {offers.length === 0 ? (
        <p className="rounded-lg border border-surface-border bg-surface-card p-6 text-center text-sm text-text-secondary">
          No offers yet. Add the first one above — it will start looping
          for every player as soon as the ticker is on.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {offers.map((o) => (
            <div
              key={o.id}
              className={cn(
                "admin-lift rounded-lg border border-surface-border bg-surface-card p-4",
                !o.is_active && "opacity-60",
              )}
            >
              <p className="text-sm font-semibold leading-snug text-text-primary">
                {o.text}
              </p>
              <p className="mt-1.5 text-[11px] text-text-secondary">
                Order {o.sort_order} ·{" "}
                {o.is_active ? "Active — in the ticker" : "Paused"}
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormFor(o)}
                  aria-label={`Edit ${o.text}`}
                  className="admin-focus rounded p-1.5 text-text-secondary hover:text-gold"
                >
                  <EditIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void doToggleActive(o)}
                  className="admin-focus rounded-md border border-surface-border px-2.5 py-1 text-[11px] font-semibold text-text-primary hover:text-gold"
                >
                  {o.is_active ? "Pause" : "Activate"}
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    if (confirmId === o.id) void doDelete(o);
                    else setConfirmId(o.id);
                  }}
                  aria-label={
                    confirmId === o.id ? "Confirm delete" : `Delete ${o.text}`
                  }
                  className={cn(
                    "admin-focus rounded-md px-2.5 py-1 text-[11px] font-semibold",
                    confirmId === o.id
                      ? "bg-danger text-white"
                      : "text-text-secondary hover:text-danger",
                  )}
                >
                  {confirmId === o.id ? "Confirm?" : (
                    <TrashIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
