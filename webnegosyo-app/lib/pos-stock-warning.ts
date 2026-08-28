/**
 * The register's stock check — a WARNING, deliberately never a refusal.
 *
 * The web checkout REFUSES a cart the kitchen cannot fill
 * (`src/lib/inventory/checkout-stock-guard.ts` on the platform). That is right
 * there: nobody is standing over the customer, and they can fix the cart
 * themselves in the seconds it takes to read the message.
 *
 * The register is the opposite situation in every respect. A cashier is facing
 * a paying customer with a queue behind them, can see the shelf with their own
 * eyes, and routinely knows things the ledger does not — a delivery that
 * arrived and has not been keyed in, a stocktake nobody ran, a recipe that
 * over-states what a portion really uses. Turning a software estimate into a
 * refused, in-person, cash-in-hand sale is a far worse trade than overselling
 * by one. So the register is TOLD, and the human decides.
 *
 * That divergence is the design, not an omission.
 *
 * Ceilings come from the platform's `/api/inventory/ceilings`, so the register
 * and the storefront quote the same number. Per-dish, not per-cart: the shared
 * ingredient arithmetic the online guard runs needs the whole recipe graph, and
 * for a warning "you have more of this than we can make" is the useful half.
 */

import type { PosCartLine } from "./pos-cart";

/** Menu item id → whole units producible. Absent means no ceiling. */
export type PosStockCeilings = ReadonlyMap<string, number>;

interface ShortDish {
  name: string;
  producible: number;
}

/**
 * What to tell the cashier, or `null` when there is nothing worth saying.
 *
 * Lines of the same dish are added up first — two lines of three against a
 * shelf for five is six pizzas, and judged apart each line looks fine.
 */
export function resolvePosStockWarning(
  lines: readonly PosCartLine[],
  ceilings: PosStockCeilings,
): string | null {
  if (ceilings.size === 0) return null;

  const orderedByDish = new Map<string, { name: string; quantity: number }>();
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const existing = orderedByDish.get(line.menuItemId);
    orderedByDish.set(line.menuItemId, {
      name: existing?.name ?? line.name,
      quantity: (existing?.quantity ?? 0) + quantity,
    });
  }

  const short: ShortDish[] = [];
  for (const [menuItemId, ordered] of orderedByDish) {
    const producible = ceilings.get(menuItemId);
    // Absent means untracked, which means no ceiling — never a warning.
    if (producible === undefined) continue;
    if (ordered.quantity <= producible) continue;

    short.push({ name: ordered.name, producible });
  }

  if (short.length === 0) return null;

  const parts = short.map((dish) =>
    // Zero is spelled out: a count reads as a quantity to try, and this is not
    // one. The cashier can still ring it — they just do it knowingly.
    dish.producible <= 0
      ? `${dish.name} is sold out`
      : `${dish.name}: stock for ${dish.producible}`,
  );

  return `Low stock — ${parts.join(", ")}. Ring it up if you have it.`;
}
