// Whether a newly observed order is ready to be auto-printed, or must wait for
// its line items. Pure: no React, no backend.
//
// Both auto-print watchers claim a chit BEFORE printing it, so that a jam
// reprints from the ticket's own button rather than a crash loop reprinting
// every order. The cost of that ordering is that a chit printed without its
// lines is never corrected: the claim has already marked it done.
//
// That gap opened when the line-item read stopped being "every line the tenant
// has" and started being keyed on the orders currently on screen. A brand-new
// order now reaches `orders` one read before its lines reach `allItems`, and
// `keepPreviousData` hands the watcher the PREVIOUS order set's lines in the
// meantime — which by definition cannot contain the new order's. Without a
// gate the watcher joins the new order to zero lines and prints a blank chit.

/** Ids ready to print now, and ids to hold until their lines arrive. */
export interface LinesSplit {
  printable: string[];
  waiting: string[];
}

/**
 * Split newly observed order ids on whether their lines have been read.
 *
 * @param observed      Ids the watcher has just seen, in the order seen.
 * @param lineCountById Line count per order currently on the board. An id
 *                      absent from this map is no longer on the board.
 *
 * An id still on the board with no lines yet goes to `waiting`, to be replayed
 * on the next evaluation through the same pending mechanism the printed-ledger
 * gap already uses. An id that left the board before its lines ever arrived is
 * dropped rather than held forever — it was never claimed, so the ticket's own
 * reprint button still has it.
 */
export function splitOnLinesLoaded(
  observed: readonly string[],
  lineCountById: ReadonlyMap<string, number>
): LinesSplit {
  const printable: string[] = [];
  const waiting: string[] = [];

  for (const id of observed) {
    const lines = lineCountById.get(id);
    if (lines === undefined) continue;
    if (lines > 0) {
      printable.push(id);
      continue;
    }
    waiting.push(id);
  }

  return { printable, waiting };
}
