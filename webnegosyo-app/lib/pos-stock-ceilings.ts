import { getWebAppUrl } from "./web-app-url";
import type { PosStockCeilings } from "./pos-stock-warning";

/**
 * How many of each dish the kitchen can currently make.
 *
 * The same public endpoint the storefront's quantity stepper reads, so a
 * cashier and a customer looking at the same dish are quoted the same number.
 * Unauthenticated by design on the platform side: it carries nothing steerable
 * and returns one integer per dish — no ingredient, cost or supplier crosses
 * that boundary.
 *
 * NEVER THROWS, and an empty map is the answer to every failure. A register
 * whose stock read hiccuped must ring up sales exactly as it did before this
 * existed — `resolvePosStockWarning` treats an empty map as "no opinion", so
 * the till simply carries on. A warning that can break the till is not an aid.
 */

const NO_CEILINGS: PosStockCeilings = new Map();

export async function fetchPosStockCeilings(
  tenantId: string | null | undefined,
  outletId: string | null,
): Promise<PosStockCeilings> {
  if (!tenantId) return NO_CEILINGS;

  try {
    const params = new URLSearchParams({ tenantId });
    if (outletId) params.set("outletId", outletId);

    const response = await fetch(
      `${getWebAppUrl()}/api/inventory/ceilings?${params.toString()}`,
    );
    if (!response.ok) return NO_CEILINGS;

    const body = (await response.json()) as { ceilings?: Record<string, number> };
    if (!body || typeof body.ceilings !== "object" || body.ceilings === null) {
      return NO_CEILINGS;
    }

    return new Map(Object.entries(body.ceilings));
  } catch {
    return NO_CEILINGS;
  }
}

/** The part of a cart line the ceiling read cares about. */
export interface StockCeilingLineLike {
  menuItemId: string;
  quantity: number;
}

/**
 * A value key for WHICH dishes are in the sale.
 *
 * The ceiling is what the kitchen can make, so it moves when a sale is rung
 * up — not when the cashier taps "+" on a line. Keying the read on the set of
 * dish ids (sorted, de-duplicated) means a quantity change re-reads nothing
 * and a line removed and re-added lands on the same key.
 */
export function lineIdSetKey(lines: readonly StockCeilingLineLike[]): string {
  const ids = Array.from(new Set(lines.map((line) => line.menuItemId)));
  return ids.sort().join(",");
}
