/**
 * How many of each dish the kitchen can make, for the register's warning.
 *
 * Keyed on WHICH dishes are in the sale — `lineIdSetKey` — because the ceiling
 * is what the kitchen can produce, and tapping "+" on a line does not move
 * that. Debounced, so a cashier adding three dishes in quick succession costs
 * one round trip rather than three.
 *
 * Not on the query cache: the read never throws, an empty map is its answer to
 * every failure, and the warning it feeds is advisory — see
 * `fetchPosStockCeilings`.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchPosStockCeilings, lineIdSetKey, type StockCeilingLineLike } from "../pos-stock-ceilings";
import type { PosStockCeilings } from "../pos-stock-warning";

export const STOCK_CEILING_DEBOUNCE_MS = 300;

/** No stock read yet, or none possible. Read as "no opinion", never as empty shelves. */
const EMPTY_CEILINGS: PosStockCeilings = new Map();

export function usePosStockCeilings(
  tenantId: string | null | undefined,
  outletId: string | null,
  lines: readonly StockCeilingLineLike[]
): PosStockCeilings {
  const [ceilings, setCeilings] = useState<PosStockCeilings>(EMPTY_CEILINGS);
  const idsKey = useMemo(() => lineIdSetKey(lines), [lines]);

  useEffect(() => {
    if (!tenantId) {
      setCeilings(EMPTY_CEILINGS);
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(() => {
      void fetchPosStockCeilings(tenantId, outletId).then((next) => {
        if (!isCancelled) setCeilings(next);
      });
    }, STOCK_CEILING_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
    // `idsKey` stands in for `lines`: a quantity change must not re-read.
  }, [tenantId, outletId, idsKey]);

  return ceilings;
}
