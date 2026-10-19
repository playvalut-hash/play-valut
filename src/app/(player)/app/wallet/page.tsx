import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CheckIcon, ClockIcon, PlusIcon, XIcon } from "@/components/icons";
import type { Deposit } from "../_types";

function StatusChip({ status }: { status: Deposit["status"] }) {
  if (status === "approved") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
        <CheckIcon className="h-3 w-3" />
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-bold text-danger">
        <XIcon className="h-3 w-3" />
        Rejected
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-gold animate-pulse">
      <ClockIcon className="h-3 w-3" />
      Pending
    </span>
  );
}

/**
 * Wallet = Deposit button + deposit history ONLY (F32).
 * No balance pill, no amounts, no VIP/XP — anywhere.
 */
export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let deposits: Deposit[] = [];
  if (user) {
    const { data } = await supabase
      .from("deposits")
      .select(
        "id, payment_method_id, screenshot_path, status, admin_note, created_at, method:payment_methods(name)",
      )
      .eq("player_id", user.id)
      .order("created_at", { ascending: false });
    deposits = (data ?? []) as unknown as Deposit[];
  }

  return (
    <div className="px-4 pt-5">
      <h1 className="text-xl font-extrabold text-text-primary">Wallet</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Add funds and track your deposits.
      </p>

      <Link
        href="/app/deposit"
        className="mt-4 flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-gold text-base font-bold text-text-ongold shadow-[0_4px_20px_rgba(139,92,246,0.25)] transition hover:brightness-110"
      >
        <PlusIcon className="h-5 w-5" />
        Deposit
      </Link>

      <h2 className="mt-6 text-base font-bold text-text-primary">
        Deposit history
      </h2>
      {deposits.length === 0 ? (
        <p className="mt-3 rounded-xl border border-surface-border bg-surface-card p-6 text-center text-sm text-text-secondary">
          No deposits yet. Tap Deposit above to add funds.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5 pb-6">
          {deposits.map((deposit) => (
            <article
              key={deposit.id}
              className="rounded-xl border border-surface-border bg-surface-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-text-primary">
                    {deposit.method?.name ?? "Payment method"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {new Date(deposit.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <StatusChip status={deposit.status} />
              </div>
              {deposit.status === "rejected" && deposit.admin_note ? (
                <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                  {deposit.admin_note}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
