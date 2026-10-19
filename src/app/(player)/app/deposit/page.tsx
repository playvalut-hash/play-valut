import { createClient } from "@/lib/supabase/server";
import DepositFlow from "./_deposit-flow";
import type { PaymentMethod } from "../_types";

/** Deposit: amount → method → pay → screenshot (F16). */
export default async function DepositPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select(
      "id, name, brand_color, account_name, handle, pay_link, note, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const methods = (data ?? []) as unknown as PaymentMethod[];

  return <DepositFlow methods={methods} />;
}
