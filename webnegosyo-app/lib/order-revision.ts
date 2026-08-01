/**
 * What changed between the order as placed and the order as edited.
 *
 * This diff is written verbatim into the revision history a merchant reads back
 * weeks later, so it is phrased in their terms — "Added 2x Latte", not a JSON
 * patch. It is also the audit trail that makes an edited bill defensible.
 *
 * Pure and side-effect free.
 */

import type { RevisedOrderItem } from "./order-edit-cart";

export type ChangeKind = "added" | "removed" | "quantity" | "repriced";

export interface OrderItemChange {
  kind: ChangeKind;
  menuItemName: string;
  /** Set for added/removed. */
  quantity?: number;
  /** Set for quantity changes. */
  quantityBefore?: number;
  quantityAfter?: number;
  /** Set for repricings. */
  priceBefore?: number;
  priceAfter?: number;
  /** Signed money movement. Summing these across a diff gives the total delta. */
  subtotalDelta: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Line identity for diffing.
 *
 * Deliberately includes the modifiers and the kitchen note: "Small Latte" and
 * "Large Latte" are different products to the kitchen, so swapping one for the
 * other reads as a removal plus an addition rather than a silent repricing.
 * Modifier names are sorted so selection order never splits a match.
 */
function itemKey(item: RevisedOrderItem): string {
  const modifiers = [
    ...(item.variationSelections ?? []).map((s) => `${s.typeName}:${s.optionName}`),
    ...(item.addons ?? []).map((a) => `addon:${a.name}`),
  ]
    .sort()
    .join(",");

  return `${item.menuItemId}|${modifiers}|${item.specialInstructions ?? ""}`;
}

/** Collapse duplicate lines so a diff never double-counts a stacked item. */
function indexByKey(items: readonly RevisedOrderItem[]): Map<string, RevisedOrderItem> {
  const index = new Map<string, RevisedOrderItem>();

  for (const item of items) {
    const key = itemKey(item);
    const existing = index.get(key);

    index.set(
      key,
      existing
        ? {
            ...existing,
            quantity: existing.quantity + item.quantity,
            subtotal: round2(existing.subtotal + item.subtotal),
          }
        : item,
    );
  }

  return index;
}

/**
 * Compare two item lists.
 *
 * The signed `subtotalDelta` values always reconcile to the difference between
 * the two orders' item totals — if they did not, the balance shown to the
 * cashier would be a lie.
 */
export function diffOrderItems(
  before: readonly RevisedOrderItem[],
  after: readonly RevisedOrderItem[],
): OrderItemChange[] {
  const beforeIndex = indexByKey(before);
  const afterIndex = indexByKey(after);
  const changes: OrderItemChange[] = [];

  for (const [key, previous] of beforeIndex) {
    const current = afterIndex.get(key);

    if (!current) {
      changes.push({
        kind: "removed",
        menuItemName: previous.menuItemName,
        quantity: previous.quantity,
        subtotalDelta: round2(-previous.subtotal),
      });
      continue;
    }

    const subtotalDelta = round2(current.subtotal - previous.subtotal);

    if (current.quantity !== previous.quantity) {
      changes.push({
        kind: "quantity",
        menuItemName: current.menuItemName,
        quantityBefore: previous.quantity,
        quantityAfter: current.quantity,
        subtotalDelta,
      });
      continue;
    }

    if (current.price !== previous.price) {
      changes.push({
        kind: "repriced",
        menuItemName: current.menuItemName,
        priceBefore: previous.price,
        priceAfter: current.price,
        subtotalDelta,
      });
    }
  }

  for (const [key, current] of afterIndex) {
    if (beforeIndex.has(key)) continue;

    changes.push({
      kind: "added",
      menuItemName: current.menuItemName,
      quantity: current.quantity,
      subtotalDelta: round2(current.subtotal),
    });
  }

  return changes;
}

/** One change, in words a merchant can read back without a legend. */
export function describeChange(change: OrderItemChange): string {
  switch (change.kind) {
    case "added":
      return `Added ${change.quantity}x ${change.menuItemName}`;
    case "removed":
      return `Removed ${change.quantity}x ${change.menuItemName}`;
    case "quantity":
      return `${change.menuItemName} ${change.quantityBefore}x to ${change.quantityAfter}x`;
    case "repriced":
      return `${change.menuItemName} repriced ${change.priceBefore} to ${change.priceAfter}`;
  }
}
