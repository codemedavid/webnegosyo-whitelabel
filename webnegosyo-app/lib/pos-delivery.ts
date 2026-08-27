/**
 * Manual delivery details on a counter sale.
 *
 * The register can now ring up a delivery: an optional fee the cashier types,
 * and optional address/phone for the rider. All three are OPTIONAL — a plain
 * walk-in sale carries none of them and behaves exactly as before.
 *
 * The fee itself is charged in exactly one place, `cartTotals`; this module
 * only decides what the fee IS. Address and phone ride the `customerData`
 * blob (`delivery_address`, `customer_phone`) because every already-deployed
 * backend accepts blob keys with no schema bump, and `buildCustomerDetailRows`
 * already renders them on the order detail screen — the same trick the POS
 * payment payload uses (see `pos-order.ts`).
 *
 * Mirrors `lib/customers/pos-attachment.ts`: a pure field builder plus a
 * `clearedSaleDelivery()` spread into every path that finishes or abandons a
 * sale, so a fee attached to one customer's order can never be billed to the
 * next stranger at the counter.
 */

import { round2 } from "./pos-cart";

/** The delivery half of the register's state for one sale. */
export interface PosDeliveryDetails {
  /** Pesos the cashier is charging for delivery. Null = no fee attached. */
  fee: number | null;
  address: string;
  phone: string;
}

/** The delivery slice of the store, as a finished sale leaves it. */
export interface ClearedSaleDelivery {
  delivery: PosDeliveryDetails;
}

/**
 * Wipe the delivery details from the register.
 *
 * A function rather than a shared constant so no two sales can reach the same
 * object — the same reasoning as `clearedSaleCustomer`.
 */
export function clearedSaleDelivery(): ClearedSaleDelivery {
  return { delivery: { fee: null, address: "", phone: "" } };
}

/**
 * Parse what the cashier typed into the fee box.
 *
 * Null for anything that is not a positive peso amount: the field is optional,
 * and a garbage entry must read as "no fee" rather than billing NaN.
 */
export function parseDeliveryFee(input: string): number | null {
  const text = input.trim();
  if (text === "") return null;

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return round2(amount);
}

/**
 * The fee this sale actually charges. Zero for no delivery, and zero for a
 * corrupt figure — the one direction a stored glitch must never move a bill
 * is up.
 */
export function chargeableDeliveryFee(
  delivery: PosDeliveryDetails | null | undefined,
): number {
  const fee = delivery?.fee;
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee <= 0) return 0;
  return round2(fee);
}

/**
 * The blob keys a delivery sale writes into `customerData`.
 *
 * Blank fields are omitted entirely so an ordinary counter sale's blob is
 * byte-identical to what it was before this feature existed.
 */
export function deliveryCustomerData(
  delivery: PosDeliveryDetails | null | undefined,
): Record<string, string> {
  const address = delivery?.address.trim() ?? "";
  const phone = delivery?.phone.trim() ?? "";

  return {
    ...(address ? { delivery_address: address } : {}),
    ...(phone ? { customer_phone: phone } : {}),
  };
}
