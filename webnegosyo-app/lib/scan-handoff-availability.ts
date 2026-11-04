/**
 * Whether a scanned cart carries anything the store is not selling right now.
 *
 * The QR is built on the customer's phone, possibly minutes before a dish was
 * 86'd. The ONE "sold out" switch applies here exactly as it does on the
 * register grid: a dish with `is_available = false` (branch overrides
 * included — `resolveItemForOutlet` ANDs them), a dish this branch does not
 * carry, or an option that `isOptionAvailable` refuses. A stock ESTIMATE is not
 * consulted — that only ever warns.
 *
 * Pure: `scan.tsx` reads the rows and decides with this before any order is
 * created.
 */

import {
  findOutletMenuOverride,
  isItemListedAtOutlet,
  resolveItemForOutlet,
  buildOutletMenuIndex,
  type OutletMenuOverrideRow,
} from "./outlet-menu-overrides";
import {
  isOptionAvailable,
  normalizeModifierGroups,
  type ModifierSource,
} from "./modifier-groups";
import type { QrOrderItemV1 } from "./qr-order-codec";

/** The menu columns a scan reads. */
export interface HandoffMenuRow extends ModifierSource {
  id: string;
  name: string;
  price: number;
  is_available: boolean | null;
}

export type HandoffSoldOutReason = "sold_out" | "not_at_branch" | "option_sold_out";

/** One dish as this register may sell it right now. */
export interface HandoffItemAvailability {
  name: string;
  /** Null when it can be sold; otherwise why not. */
  dishBlock: Exclude<HandoffSoldOutReason, "option_sold_out"> | null;
  /** Option id → name, for every option the switch refuses. */
  soldOutOptions: ReadonlyMap<string, string>;
}

export interface SoldOutHandoffLine {
  itemName: string;
  optionName: string | null;
  reason: HandoffSoldOutReason;
}

/** Menu item id → what this register may sell of it. */
export function buildHandoffAvailability(
  rows: readonly HandoffMenuRow[],
  overrides: readonly OutletMenuOverrideRow[],
  outletId: string | null,
): Map<string, HandoffItemAvailability> {
  const index = buildOutletMenuIndex(overrides);

  return new Map(
    rows.map((row) => {
      const override = findOutletMenuOverride(index, outletId, row.id);
      const isListed = isItemListedAtOutlet(override);
      const resolved = resolveItemForOutlet(row, override);
      const dishBlock = !isListed ? "not_at_branch" : resolved.is_available === false ? "sold_out" : null;

      const soldOutOptions = new Map(
        normalizeModifierGroups(row)
          .flatMap((group) => group.options)
          .filter((option) => !isOptionAvailable(option))
          .map((option) => [option.id, option.name] as const),
      );

      return [String(row.id), { name: row.name, dishBlock, soldOutOptions }] as const;
    }),
  );
}

/**
 * The first line the store cannot sell, or null. An item the catalog does not
 * know is left to `evaluateCartHandoff`, which refuses it as unknown.
 */
export function findSoldOutHandoffLine(
  items: readonly QrOrderItemV1[],
  availability: ReadonlyMap<string, HandoffItemAvailability>,
): SoldOutHandoffLine | null {
  for (const item of items) {
    const dish = availability.get(item.menuItemId);
    if (!dish) continue;

    const itemName = item.menuItemName?.trim() || dish.name;
    if (dish.dishBlock) return { itemName, optionName: null, reason: dish.dishBlock };

    const pickedIds = [...(item.optionIds ?? []), ...(item.addonIds ?? [])];
    const soldOutId = pickedIds.find((id) => dish.soldOutOptions.has(id));
    if (soldOutId !== undefined) {
      return { itemName, optionName: dish.soldOutOptions.get(soldOutId) ?? null, reason: "option_sold_out" };
    }
  }
  return null;
}

/** What staff read on the blocked scan. */
export function describeSoldOutHandoff(line: SoldOutHandoffLine): string {
  const fix = "Ask the customer to change their cart, then scan again.";
  if (line.reason === "not_at_branch") return `${line.itemName} isn't sold at this branch. ${fix}`;
  if (line.reason === "option_sold_out") {
    return `${line.itemName}: ${line.optionName ?? "a choice"} is sold out right now. ${fix}`;
  }
  return `${line.itemName} is sold out right now. ${fix}`;
}
