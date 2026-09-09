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
import type { OrderTypeItemPriceRow } from "./order-type-pricing";

export interface PosOrderType {
  id: string;
  /** Machine label, e.g. "dine_in" — what the order row stores. */
  type: string;
  /** Merchant-facing label, e.g. "Dine In". */
  name: string;
  serviceCharge: ServiceCharge | undefined;
  /**
   * Percent the register adds to every price on this channel (Grab, foodpanda
   * take a commission). Null means store prices — what every tenant had before
   * per-order-type pricing existed.
   */
  markupPercent: number | null;
}

interface OrderTypeRow {
  id: string;
  type: string;
  name: string;
  service_charge_enabled: boolean | null;
  service_charge_type: "percentage" | "fixed" | null;
  service_charge_value: number | null;
  /** `numeric(6,2)` — PostgREST hands it over as a string. */
  pos_markup_percent: number | string | null;
}

function toMarkupPercent(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const ORDER_TYPE_COLUMNS =
  "id, type, name, service_charge_enabled, service_charge_type, service_charge_value, pos_markup_percent";

function toPosOrderType(row: OrderTypeRow): PosOrderType {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    serviceCharge: row.service_charge_enabled
      ? {
          type: row.service_charge_type ?? "percentage",
          value: Number(row.service_charge_value ?? 0),
        }
      : undefined,
    markupPercent: toMarkupPercent(row.pos_markup_percent),
  };
}

/**
 * The tenant's enabled order types, in the merchant's configured order.
 *
 * `posOnly` narrows to types the merchant made available on the register.
 * The two readers below share this so they can never drift in what they
 * select or how they map a row.
 */
async function readOrderTypes(tenantId: string, posOnly: boolean): Promise<PosOrderType[]> {
  const base = supabase
    .from("order_types")
    .select(ORDER_TYPE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true);
  const { data, error } = await (posOnly ? base.eq("available_on_pos", true) : base).order(
    "order_index",
    { ascending: true },
  );

  if (error) throw error;
  return ((data ?? []) as unknown as OrderTypeRow[]).map(toPosOrderType);
}

/**
 * EVERY enabled order type for the tenant. Read by the payment-method editor,
 * which links methods to order types — a web-only type must still be offered
 * there, or the merchant could not link a method to it from the app.
 */
export function listOrderTypes(tenantId: string): Promise<PosOrderType[]> {
  return readOrderTypes(tenantId, false);
}

/**
 * The order types the register may ring up: enabled AND POS-available. A type
 * the merchant marked web-only never reaches the register's chips.
 */
export function listRegisterOrderTypes(tenantId: string): Promise<PosOrderType[]> {
  return readOrderTypes(tenantId, true);
}

/**
 * Every exact per-order-type item price the tenant has set, for
 * `buildOrderTypePriceIndex`.
 *
 * Not swallowed on error, for the same reason `listProducts` refuses to on a
 * failed override read: an empty set is the claim "this channel sells at the
 * marked-up list price", which after a failed query rings up the wrong money.
 */
export async function listOrderTypeItemPrices(
  tenantId: string,
): Promise<OrderTypeItemPriceRow[]> {
  const { data, error } = await supabase
    .from("order_type_item_prices")
    .select("order_type_id, menu_item_id, price")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  return (data ?? []) as unknown as OrderTypeItemPriceRow[];
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
