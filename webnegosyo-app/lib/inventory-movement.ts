/**
 * Pure rules for recording a stock movement from the merchant's phone.
 *
 * The phone states *what happened* — a magnitude and a reason — and never *what
 * the number becomes*. The signed delta is resolved by the platform, which
 * reads the on-hand quantity in the same request that writes the row. A phone
 * that computed it would be working from whatever figure it last refreshed, and
 * since the ledger is the source of truth for stock, a wrong delta is not a
 * stale screen: it is a permanent, silent corruption that only a stocktake ever
 * finds.
 *
 * The preview below is for the merchant's eyes only. It is deliberately not
 * sent anywhere.
 *
 * Network call: lib/inventory-movement-service.ts. Screen: app/(main)/inventory.tsx.
 */

import { formatStockQuantity, type StockItemView } from "./inventory-stock";

/** Why stock moved, for the movements a merchant records by hand. */
export type ManualMovementReason = "receive" | "stocktake" | "waste";

/**
 * The three a merchant makes by hand, in the order they are offered.
 *
 * `sale` and `void` are deliberately absent: the order path already writes
 * them, so a merchant recording one here would double-count against the sale
 * that moved the stock.
 */
export const MANUAL_MOVEMENT_REASONS: readonly ManualMovementReason[] = [
  "receive",
  "stocktake",
  "waste",
];

/** Merchant-facing wording. Mirrors the platform's MOVEMENT_REASON_LABELS. */
export const MOVEMENT_REASON_LABELS: Record<ManualMovementReason, string> = {
  receive: "Received",
  stocktake: "Counted",
  waste: "Wasted",
};

/** What each reason asks the merchant for — the counter to a mis-picked reason. */
export const MOVEMENT_REASON_PROMPTS: Record<ManualMovementReason, string> = {
  receive: "How much arrived",
  stocktake: "How much is actually on the shelf",
  waste: "How much was thrown away",
};

export interface MovementDraft {
  reason: ManualMovementReason;
  /** Held as a string while being typed. */
  quantity: string;
  note: string;
}

export const EMPTY_MOVEMENT_DRAFT: MovementDraft = {
  reason: "receive",
  quantity: "",
  note: "",
};

/** Exactly what the platform's stock movement endpoint accepts. */
export interface MovementPayload {
  inventory_item_id: string;
  reason: ManualMovementReason;
  /** Always a magnitude. The reason carries the direction. */
  quantity: number;
  unit_id: string;
  note?: string;
}

/** A typed quantity, or null while it is not yet a usable number. */
function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Coerce a draft into the payload, or throw a message worth showing.
 *
 * Zero is rejected for a delivery and accepted for a count: receiving nothing
 * is a slip, but counting zero is the single most important count a merchant
 * can record — it says the shelf is empty.
 */
export function buildMovementPayload(
  draft: MovementDraft,
  item: StockItemView,
): MovementPayload {
  const quantity = parseQuantity(draft.quantity);
  if (quantity === null) throw new Error("Enter the amount as a positive number");
  if (quantity === 0 && draft.reason !== "stocktake") {
    throw new Error("Enter an amount greater than zero");
  }
  if (!item.stockUnitId) {
    throw new Error(`${item.name} has no stock unit yet, so it cannot be counted`);
  }

  const note = draft.note.trim();
  return {
    inventory_item_id: item.id,
    reason: draft.reason,
    quantity,
    unit_id: item.stockUnitId,
    note: note === "" ? undefined : note,
  };
}

export interface MovementOutcome {
  from: string;
  to: string;
}

/**
 * What the shelf will read after this movement, for the merchant to check
 * before committing. Null while the field is not a usable number — a guess
 * would be worse than a blank.
 *
 * This mirrors the platform's `resolveMovementDelta` and must keep mirroring
 * it, but it is never the source of the write.
 */
export function describeMovementOutcome(
  reason: ManualMovementReason,
  quantity: string,
  item: StockItemView,
): MovementOutcome | null {
  const amount = parseQuantity(quantity);
  if (amount === null) return null;

  const next =
    reason === "receive"
      ? item.quantity + amount
      : reason === "waste"
        ? item.quantity - amount
        : // A stocktake reports what is physically there; it replaces rather
          // than adjusts.
          amount;

  return {
    from: formatStockQuantity(item.quantity, item.unitAbbreviation),
    to: formatStockQuantity(next, item.unitAbbreviation),
  };
}

/**
 * Whether this would waste more than the shelf holds — a warning, never a
 * block.
 *
 * Stock legitimately goes negative when a sale lands before its delivery is
 * recorded, so refusing the write would leave a merchant unable to record the
 * truth. But throwing away more than exists is far more often a typo, and this
 * is the last moment it can be caught for free.
 */
export function isOvercountedWaste(
  reason: ManualMovementReason,
  quantity: string,
  item: StockItemView,
): boolean {
  if (reason !== "waste") return false;
  const amount = parseQuantity(quantity);
  if (amount === null) return false;
  return amount > item.quantity;
}
