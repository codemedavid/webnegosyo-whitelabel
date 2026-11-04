/**
 * How many of each dish the kitchen can make, for the register's warning.
 *
 * Read when WHICH dishes are in the sale changes — `lineIdSetKey` — because the
 * ceiling is what the kitchen can produce, and tapping "+" on a line does not
 * move that. Debounced, so a cashier adding three dishes in quick succession
 * costs one round trip rather than three.
 *
 * Kept fresh, because other registers and the storefront sell from the same
 * shelf (the "N left" badges went stale until the cart changed):
 *  - shortly after each completed sale (`saleStamp`), once the sale's stock
 *    has had a moment to be written behind;
 *  - when the register comes back into focus, and every
 *    `STOCK_REFRESH_INTERVAL_MS` while it stays in focus. The timer stops on
 *    blur and skips a tick while a read is still in flight, so a slow network
 *    never piles reads up.
 *
 * Not on the query cache: the read never throws, empty ceilings are its answer
 * to every failure, and the warning it feeds is advisory — see
 * `fetchPosStockCeilings`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPosStockCeilings, lineIdSetKey, type StockCeilingLineLike } from "../pos-stock-ceilings";
import { NO_STOCK_CEILINGS, type PosStockCeilings } from "../pos-stock-warning";

export const STOCK_CEILING_DEBOUNCE_MS = 300;
/** A register left open re-reads the shelf this often while it is on screen. */
export const STOCK_REFRESH_INTERVAL_MS = 60_000;
/** The sale's stock is written behind the receipt; give it a moment to land. */
export const STOCK_AFTER_SALE_DELAY_MS = 3_000;

/** No stock read yet, or none possible. Read as "no opinion", never as empty shelves. */
const EMPTY_CEILINGS: PosStockCeilings = NO_STOCK_CEILINGS;

export interface PosStockCeilingsOptions {
  /** The register is on screen. Off (the default) = no timer. */
  isFocused?: boolean;
  /** Changes once per completed sale (the last sale's `shownAt`); null = none yet. */
  saleStamp?: number | null;
}

export function usePosStockCeilings(
  tenantId: string | null | undefined,
  outletId: string | null,
  lines: readonly StockCeilingLineLike[],
  options: PosStockCeilingsOptions = {},
): PosStockCeilings {
  const { isFocused = false, saleStamp = null } = options;
  const [ceilings, setCeilings] = useState<PosStockCeilings>(EMPTY_CEILINGS);
  // Bumped to ask for a fresh read without the cart changing.
  const [refreshCount, setRefreshCount] = useState(0);
  const isReadingRef = useRef(false);
  const idsKey = useMemo(() => lineIdSetKey(lines), [lines]);

  useEffect(() => {
    if (!tenantId) {
      setCeilings(EMPTY_CEILINGS);
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(() => {
      isReadingRef.current = true;
      void fetchPosStockCeilings(tenantId, outletId).then((next) => {
        if (isCancelled) return;
        isReadingRef.current = false;
        setCeilings(next);
      });
    }, STOCK_CEILING_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      isReadingRef.current = false;
      clearTimeout(timer);
    };
    // `idsKey` stands in for `lines`: a quantity change must not re-read.
  }, [tenantId, outletId, idsKey, refreshCount]);

  // On screen: re-read on arrival, then on a modest timer until blur.
  useEffect(() => {
    if (!tenantId || !isFocused) return;
    const refresh = () => {
      if (!isReadingRef.current) setRefreshCount((count) => count + 1);
    };
    refresh();
    const interval = setInterval(refresh, STOCK_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tenantId, isFocused]);

  // After each completed sale, once its stock has had time to be written.
  useEffect(() => {
    if (!tenantId || saleStamp === null) return;
    const timer = setTimeout(() => setRefreshCount((count) => count + 1), STOCK_AFTER_SALE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [tenantId, saleStamp]);

  return ceilings;
}
