/**
 * Supabase reads the register needs beyond the product catalog: the tenant's
 * order types and the payment methods available for the chosen one.
 *
 * The payment-method query mirrors the web's `getPaymentMethodsByOrderTypeClient`
 * exactly — an INNER join on payment_method_order_types, so a method with no
 * order-type link is offered for none. Diverging here would let the register
 * take payments the storefront refuses.
 */

import { supabase } from "./supabase";
import type { ServiceCharge } from "./pos-cart";
import type { PosPaymentMethod } from "./pos-payment-methods";

export interface PosOrderType {
  id: string;
  /** Machine label, e.g. "dine_in" — what the order row stores. */
  type: string;
  /** Merchant-facing label, e.g. "Dine In". */
  name: string;
  serviceCharge: ServiceCharge | undefined;
}

interface OrderTypeRow {
  id: string;
  type: string;
  name: string;
  service_charge_enabled: boolean | null;
  service_charge_type: "percentage" | "fixed" | null;
  service_charge_value: number | null;
}

/** Enabled order types for the tenant, in the merchant's configured order. */
export async function listOrderTypes(tenantId: string): Promise<PosOrderType[]> {
  const { data, error } = await supabase
    .from("order_types")
    .select("id, type, name, service_charge_enabled, service_charge_type, service_charge_value")
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true)
    .order("order_index", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as OrderTypeRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    serviceCharge: row.service_charge_enabled
      ? {
          type: row.service_charge_type ?? "percentage",
          value: Number(row.service_charge_value ?? 0),
        }
      : undefined,
  }));
}

/** Active payment methods the merchant allows for this order type. */
export async function listPaymentMethods(
  tenantId: string,
  orderTypeId: string,
): Promise<PosPaymentMethod[]> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select(
      "id, name, details, qr_code_url, require_payment_proof, order_index, payment_method_order_types!inner(order_type_id)",
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("payment_method_order_types.order_type_id", orderTypeId)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as PosPaymentMethod[];
}

/**
 * Every active payment method for the tenant, with no order-type filter.
 *
 * Settling an edited order is deliberately NOT narrowed the way ringing up a
 * new sale is: a customer who paid a delivery order by GCash may hand over cash
 * for the ₱120 difference, and refusing that would leave the cashier unable to
 * close the bill at all. The order-type restriction exists to stop the
 * storefront offering a method for the wrong channel, which is a different
 * question from how a shortfall is squared at the counter.
 */
export async function listAllPaymentMethods(
  tenantId: string,
): Promise<PosPaymentMethod[]> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, name, details, qr_code_url, require_payment_proof, order_index")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as PosPaymentMethod[];
}
