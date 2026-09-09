/**
 * Whether staff may accept a scanned cart handoff, and at what prices.
 *
 * Pure, so the rule that turns a customer-authored QR into an order is
 * testable without a camera or a network. The checksum in the codec is a
 * corruption guard only; this is where the payload is actually distrusted.
 * Mirrors evaluatePickupTicket in pickup/guards.ts: the store check comes
 * first, before anything is said about the cart.
 */

import type { QrOrderItemV1, QrOrderPayloadV1 } from "./qr-order-codec";

export type HandoffBlockReason =
  | "wrong_tenant"
  | "no_items"
  /** An item the store's catalog does not carry — its QR price is untrusted. */
  | "unknown_item"
  | "bad_quantity"
  | "bad_price";

export type HandoffVerdict =
  | {
      ok: true;
      items: QrOrderItemV1[];
      total: number;
      /** At least one base price was replaced by the catalog's. */
      pricesUpdated: boolean;
    }
  | { ok: false; reason: HandoffBlockReason };

interface CartHandoffContext {
  payload: Pick<QrOrderPayloadV1, "tenantId" | "items">;
  /** Tenant the signed-in staff member is currently working in. */
  sessionTenantId: string | null;
  /** Base price per menu item id, as read from this store's catalog. */
  catalogPrices: ReadonlyMap<string, number>;
}

// Base prices that differ by less than this are the same price; the QR
// carries floats that have been through JSON and lz-string.
const PRICE_EPSILON = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isValidQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

function findItemFault(
  item: QrOrderItemV1,
  catalogPrices: ReadonlyMap<string, number>,
): HandoffBlockReason | null {
  if (!catalogPrices.has(item.menuItemId)) return "unknown_item";
  if (!isValidQuantity(item.quantity)) return "bad_quantity";
  if (!Number.isFinite(item.price) || !Number.isFinite(item.subtotal)) return "bad_price";
  return null;
}

/**
 * Re-price one item from the catalog. The per-unit variation/addon delta the
 * QR carried is preserved; only the base price is the catalog's to decide.
 */
function repriceFromCatalog(item: QrOrderItemV1, catalogPrice: number): QrOrderItemV1 {
  if (Math.abs(catalogPrice - item.price) < PRICE_EPSILON) return item;
  const perUnitDelta = round2(item.subtotal / item.quantity - item.price);
  const newUnit = round2(catalogPrice + perUnitDelta);
  return { ...item, price: catalogPrice, subtotal: round2(newUnit * item.quantity) };
}

export function evaluateCartHandoff({
  payload,
  sessionTenantId,
  catalogPrices,
}: CartHandoffContext): HandoffVerdict {
  if (!sessionTenantId || sessionTenantId !== payload.tenantId) {
    return { ok: false, reason: "wrong_tenant" };
  }
  if (payload.items.length === 0) {
    return { ok: false, reason: "no_items" };
  }

  for (const item of payload.items) {
    const fault = findItemFault(item, catalogPrices);
    if (fault) return { ok: false, reason: fault };
  }

  const items = payload.items.map((item) =>
    // `has` was checked above, so the lookup cannot miss.
    repriceFromCatalog(item, catalogPrices.get(item.menuItemId) ?? item.price),
  );
  const pricesUpdated = items.some((item, index) => item !== payload.items[index]);
  const total = round2(items.reduce((sum, item) => sum + item.subtotal, 0));

  return { ok: true, items, total, pricesUpdated };
}
