"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminInfo, BrandingRow } from "../../../_actions";
import {
  removeBrandLogo,
  updateBranding,
  updateGuestMode,
  uploadBrandLogo,
} from "../../../_actions";
import { EyeIcon, ImageIcon, UploadIcon } from "@/components/icons";

/** Live preview: miniature mock of the player sign-in screen. */
function LivePreview({ branding }: { branding: BrandingRow }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-navy px-6 py-10">
      <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-gold/40 bg-gold/10">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="Brand logo" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xl font-bold text-gold">P</span>
        )}
      </span>
      <p className="mt-3 text-lg font-bold">
        <span className="text-text-primary">
          {branding.brandName.replace(/(Vault|Valut)$/i, "").trim() || branding.brandName}
        </span>{" "}
        <span className="text-gold">
          {/(Vault|Valut)$/i.test(branding.brandName) ? branding.brandName.match(/(Vault|Valut)$/i)?.[0] : ""}
        </span>
      </p>
      <p className="mt-4 text-sm font-semibold text-text-primary">{branding.signinHeading}</p>
      <p className="mt-1 max-w-[220px] text-center text-xs text-text-secondary">
        {branding.signinSubtext}
      </p>
      <div className="mt-5 w-full max-w-[220px] space-y-2">
        <div className="flex items-center gap-2 rounded-md border border-gold/40 bg-surface-input px-3 py-2">
          <span className="text-xs text-text-muted">Email</span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-gold/40 bg-surface-input px-3 py-2">
          <span className="text-xs text-text-muted">Password</span>
          <EyeIcon className="h-3.5 w-3.5 text-text-muted" />
        </div>
        <div className="rounded-md bg-gold py-2 text-center text-xs font-semibold text-navy">
          Sign In
        </div>
      </div>
      <p className="mt-4 text-[10px] uppercase tracking-wide text-text-muted">
        Live preview
      </p>
    </div>
  );
}

/** Branding page: brand name, logo upload, sign-in copy + live preview. */
export default function BrandingEditor({
  admin,
  branding,
}: {
  admin: AdminInfo;
  branding: BrandingRow;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    brandName: branding.brandName,
    signinHeading: branding.signinHeading,
    signinSubtext: branding.signinSubtext,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(branding.logoUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [guestMode, setGuestMode] = useState(branding.guestModeEnabled);
  const [guestBusy, setGuestBusy] = useState(false);

  const preview: BrandingRow = {
    brandName: form.brandName || branding.brandName,
    logoPath: branding.logoPath,
    logoUrl,
    signinHeading: form.signinHeading || branding.signinHeading,
    signinSubtext: form.signinSubtext || branding.signinSubtext,
    guestModeEnabled: guestMode,
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateBranding(admin.id, form);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save branding");
    } finally {
      setBusy(false);
    }
  }

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const { url } = await uploadBrandLogo(admin.id, fd);
      setLogoUrl(url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload logo");
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveLogo() {
    setRemoving(true);
    setError(null);
    try {
      const res = await removeBrandLogo(admin.id);
      if (!res.ok) {
        setError(res.error);
      } else {
        setLogoUrl(null);
        router.refresh();
      }
    } catch {
      setError("Could not remove logo");
    } finally {
      setRemoving(false);
    }
  }

  async function onToggleGuestMode(next: boolean) {
    setGuestBusy(true);
    setError(null);
    try {
      const res = await updateGuestMode(admin.id, next);
      if (!res.ok) {
        setError(res.error);
      } else {
        setGuestMode(next);
        router.refresh();
      }
    } catch {
      setError("Could not save guest mode");
    } finally {
      setGuestBusy(false);
    }
  }

  const inputCls =
    "admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2.5 py-2 text-[13px] text-text-primary placeholder:text-text-muted";
  const labelCls = "mb-1 block text-[11px] font-medium text-text-secondary";

  return (
    <div className="admin-thin-scroll h-full overflow-y-auto p-4">
      <h1 className="text-base font-semibold text-text-primary">Branding</h1>
      <p className="mt-0.5 text-xs text-text-muted">
        Applies to the player sign-in screen and app header
      </p>

      {error && (
        <div role="alert" className="mt-3 max-w-2xl rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <label className="mb-3 block">
            <span className={labelCls}>Brand name</span>
            <input
              value={form.brandName}
              onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))}
              placeholder="PlayVault"
              className={inputCls}
            />
          </label>
          <label className="mb-3 block">
            <span className={labelCls}>Sign-in heading</span>
            <input
              value={form.signinHeading}
              onChange={(e) => setForm((f) => ({ ...f, signinHeading: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="mb-4 block">
            <span className={labelCls}>Sign-in sub-text</span>
            <input
              value={form.signinSubtext}
              onChange={(e) => setForm((f) => ({ ...f, signinSubtext: e.target.value }))}
              className={inputCls}
            />
          </label>

          <span className={labelCls}>Logo</span>
          <div className="flex items-center gap-3">
            <span className="relative inline-flex shrink-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Brand logo" className="h-12 w-12 rounded-full border border-surface-border object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-surface-border text-text-muted">
                  <ImageIcon className="h-5 w-5" />
                </span>
              )}
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => void onRemoveLogo()}
                  disabled={removing}
                  aria-label="Remove logo"
                  title="Remove logo"
                  className="admin-focus absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs font-bold leading-none text-white shadow hover:brightness-110 disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </span>
            <label className="admin-focus inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-surface-border px-3 py-2 text-[13px] text-text-secondary hover:text-gold">
              <UploadIcon className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload logo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  void onLogoFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="admin-focus mt-5 rounded-md bg-gold px-4 py-2 text-[13px] font-semibold text-navy hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save branding"}
          </button>

          {admin.role === "super_admin" ? (
            <div className="mt-6 border-t border-surface-border pt-4">
              <span className={labelCls}>Guest mode</span>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={guestMode}
                  disabled={guestBusy}
                  onChange={(e) => void onToggleGuestMode(e.target.checked)}
                  className="admin-focus h-5 w-5 accent-[#d4af37] disabled:opacity-50"
                />
                <span className="text-[13px] text-text-primary">
                  {guestMode ? "On — visitors can continue as guests" : "Off — no new guest entry"}
                </span>
              </label>
              <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">
                Super admin only. Off hides guest entry on the marketing
                and login pages. Guests already inside keep working and
                are pushed to activate — they are never kicked out, so
                their chat is never lost. Needs migration 0029.
              </p>
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-surface-border">
          <LivePreview branding={preview} />
        </div>
      </div>
    </div>
  );
}
