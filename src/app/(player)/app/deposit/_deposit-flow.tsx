"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CardIcon,
  CheckIcon,
  ChevronLeftIcon,
  ImageIcon,
  LinkIcon,
  UploadIcon,
} from "@/components/icons";
import { MAX_DEPOSIT, MIN_DEPOSIT, validateDepositAmount } from "@/lib/utils";
import { submitDeposit } from "../_actions";
import type { PaymentMethod } from "../_types";

type Step = "amount" | "method" | "detail" | "upload";

const STEP_LABEL: Record<Step, string> = {
  amount: "Amount",
  method: "Method",
  detail: "Pay",
  upload: "Screenshot",
};

function MethodMark({ method }: { method: PaymentMethod }) {
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white"
      style={{ backgroundColor: method.brand_color ?? "#3a4a6a" }}
    >
      {method.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function DepositFlow({ methods }: { methods: PaymentMethod[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const method = methods.find((m) => m.id === methodId) ?? null;
  const stepIndex = (["amount", "method", "detail", "upload"] as Step[]).indexOf(step);

  function goBack() {
    if (step === "method") setStep("amount");
    else if (step === "detail") setStep("method");
    else if (step === "upload") setStep("detail");
  }

  function continueFromAmount(e: React.FormEvent) {
    e.preventDefault();
    const err = validateDepositAmount(Number(amount));
    setAmountError(err);
    if (!err) setStep("method");
  }

  function pickMethod(id: string) {
    setMethodId(id);
    setStep("detail");
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function handleSubmit() {
    if (!file || !method) return;
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("amount", amount);
      formData.set("methodId", method.id);
      formData.set("screenshot", file);
      const result = await submitDeposit(formData);
      if (result.ok) {
        router.push("/app/wallet");
        router.refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <Link
          href="/app/wallet"
          className="rounded-lg p-1 text-text-secondary hover:text-text-primary transition"
          aria-label="Back to wallet"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-extrabold text-text-primary">Deposit</h1>
      </div>

      {/* Stepper */}
      <ol className="mt-4 flex gap-1.5" aria-label="Deposit steps">
        {(Object.keys(STEP_LABEL) as Step[]).map((s, i) => (
          <li key={s} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition ${
                i <= stepIndex ? "bg-gold" : "bg-surface-border"
              }`}
            />
            <p
              className={`mt-1 text-[10px] font-semibold ${
                i <= stepIndex ? "text-gold" : "text-text-muted"
              }`}
            >
              {STEP_LABEL[s]}
            </p>
          </li>
        ))}
      </ol>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {/* STEP 1 — amount */}
      {step === "amount" ? (
        <form onSubmit={continueFromAmount} className="mt-6">
          <label className="block">
            <span className="text-sm font-semibold text-text-secondary">
              How much do you want to deposit?
            </span>
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-gold/50 bg-surface-input px-4 py-4 focus-within:border-gold transition">
              <span className="text-xl font-bold text-gold">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={MIN_DEPOSIT}
                max={MAX_DEPOSIT}
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                className="w-full bg-transparent text-2xl font-bold text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </span>
          </label>
          {amountError ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {amountError}
            </p>
          ) : (
            <p className="mt-2 text-xs text-text-muted">
              Minimum ${MIN_DEPOSIT} · Maximum ${MAX_DEPOSIT.toLocaleString()}
            </p>
          )}
          <button
            type="submit"
            className="mt-6 flex w-full min-h-[56px] items-center justify-center gap-2 rounded-xl bg-gold text-base font-bold text-text-ongold transition hover:brightness-110"
          >
            Continue
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        </form>
      ) : null}

      {/* STEP 2 — method cards */}
      {step === "method" ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-text-secondary">
            Depositing <span className="font-bold text-gold">${amount}</span> —
            choose a payment method
          </p>
          {methods.length === 0 ? (
            <p className="mt-4 rounded-xl border border-surface-border bg-surface-card p-6 text-center text-sm text-text-secondary">
              No payment methods are available right now. Please ask support in
              chat.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickMethod(m.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-4 text-left transition hover:border-gold/60"
                >
                  <MethodMark method={m} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-text-primary">
                      {m.name}
                    </span>
                    <span className="block truncate text-xs text-text-secondary">
                      {m.handle}
                    </span>
                  </span>
                  <ArrowRightIcon className="h-5 w-5 shrink-0 text-text-muted" />
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={goBack}
            className="mt-4 text-sm font-semibold text-text-secondary hover:text-text-primary transition"
          >
            ← Change amount
          </button>
        </div>
      ) : null}

      {/* STEP 3 — method detail */}
      {step === "detail" && method ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-gold/30 bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <MethodMark method={method} />
              <div>
                <h2 className="text-base font-bold text-text-primary">
                  {method.name}
                </h2>
                <p className="text-xs text-text-secondary">
                  {method.account_name}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-surface-input p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Send ${amount} to
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-gold">
                {method.handle}
              </p>
              {method.note ? (
                <p className="mt-2 text-xs text-text-secondary">{method.note}</p>
              ) : null}
            </div>
            {method.pay_link ? (
              <a
                href={method.pay_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gold text-base font-bold text-text-ongold transition hover:brightness-110"
              >
                <LinkIcon className="h-5 w-5" />
                Pay ${amount}
              </a>
            ) : (
              <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-sm font-semibold text-gold-light">
                <CardIcon className="mr-2 inline h-4 w-4" />
                No pay link for {method.name} — send ${amount} manually to the
                handle above, then continue.
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={goBack}
              className="min-h-[52px] rounded-xl border border-surface-border px-5 text-sm font-bold text-text-secondary transition hover:text-text-primary"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-base font-bold text-text-ongold transition hover:brightness-110"
            >
              I’ve paid — upload screenshot
              <ArrowRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* STEP 4 — screenshot upload */}
      {step === "upload" && method ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-text-secondary">
            Attach the screenshot of your ${amount} payment via {method.name}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="sr-only"
            aria-label="Payment screenshot"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-surface-border bg-surface-card p-8 transition hover:border-gold/60"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Payment screenshot preview"
                className="max-h-56 rounded-lg object-contain"
              />
            ) : (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold">
                  <ImageIcon className="h-7 w-7" />
                </span>
                <span className="text-sm font-bold text-text-primary">
                  Choose from gallery
                </span>
                <span className="text-xs text-text-muted">
                  Image only · max 8 MB
                </span>
              </>
            )}
          </button>
          <div className="mt-4 flex gap-3 pb-6">
            <button
              type="button"
              onClick={goBack}
              className="min-h-[52px] rounded-xl border border-surface-border px-5 text-sm font-bold text-text-secondary transition hover:text-text-primary"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!file || submitting}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gold text-base font-bold text-text-ongold transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? (
                "Uploading…"
              ) : (
                <>
                  <UploadIcon className="h-5 w-5" />
                  Submit deposit
                </>
              )}
            </button>
          </div>
          {file ? (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <CheckIcon className="h-4 w-4" />
              {file.name} attached — submit to finish.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
