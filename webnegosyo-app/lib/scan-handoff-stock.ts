/**
 * Stock on a scanned web cart. A customer-authored cart must meet the same rule
 * as a tap on the register: the store's stock limit, not only the sold-out
 * switch `scan-handoff-availability.ts` already enforces.
 *
 * Pure, so the screen only fetches its input. No ceilings (offline, failed
 * read) means no opinion, exactly as on the register.
 */

import type { PosStockCeilings } from "./pos-stock-warning";

export interface HandoffStockLine {
  menuItemId: string;
  menuItemName?: string | null;
  quantity: number;
}

export type HandoffStockVerdict =
  | { kind: "ok" }
  | { kind: "warn"; message: string }
  | { kind: "block"; message: string };

const describeShort = (names: readonly string[]): string =>
  `Stock doesn't cover ${names.join(", ")}.`;

export function judgeHandoffStock(
  items: readonly HandoffStockLine[],
  ceilings: PosStockCeilings,
  canSellShort: boolean,
): HandoffStockVerdict {
  const wanted = items.reduce<ReadonlyMap<string, number>>(
    (totals, item) => new Map([...totals, [item.menuItemId, (totals.get(item.menuItemId) ?? 0) + item.quantity]]),
    new Map(),
  );
  const short = items
    .filter((item) => {
      const ceiling = ceilings.dishes.get(item.menuItemId);
      return ceiling !== undefined && (wanted.get(item.menuItemId) ?? 0) > Math.max(0, ceiling);
    })
    .map((item) => item.menuItemName?.trim() || "An item");
  if (short.length === 0) return { kind: "ok" };

  const names = [...new Set(short)];
  if (ceilings.stockPolicy === "block" && !canSellShort) {
    return {
      kind: "block",
      message: `${describeShort(names)} Ask a manager to sign in on this register, or ask the customer to change their cart.`,
    };
  }
  return { kind: "warn", message: `${describeShort(names)} Check the shelf before accepting.` };
}
