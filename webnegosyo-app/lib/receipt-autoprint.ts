// Cashier-receipt auto-print decisions. Pure, no React.
//
// Confirming an order used to print only from the order-detail screen. The
// orders list, the Drawer's incoming sheet and the web admin all confirm too,
// and each of them printed nothing — so "auto-print on confirmation" only
// worked from one of the four places a merchant actually confirms. The app-wide
// watcher (components/GlobalReceiptAutoPrint) fixes that by reacting to the
// TRANSITION rather than the tap: whichever surface moved the order past
// `pending`, this device sees it enter the confirmed set and prints once.

/**
 * Statuses an order can hold once it has been confirmed. An order id newly
 * appearing in this set was just confirmed (or created already confirmed).
 */
export const RECEIPT_CONFIRMED_STATUSES = [
  "confirmed",
  "preparing",
  "ready",
  "delivered",
] as const;

export interface ReceiptOrderLike {
  _id: string;
  status: string;
  /** Where the order was rung: "pos" sales print at the till on bill-out. */
  source?: string;
}

/**
 * Ids worth watching for a confirmation receipt.
 *
 * Counter sales are excluded: the tender screen already prints them at the
 * bill-out moment, and a POS order is created directly as `confirmed`, so the
 * watcher would otherwise see every sale "arrive confirmed" and print a
 * second receipt for a customer who is already walking away with one.
 */
export function selectConfirmedOrderIds(
  orders: readonly ReceiptOrderLike[] | undefined,
): string[] | undefined {
  if (orders === undefined) return undefined;
  return orders
    .filter(
      (order) =>
        (RECEIPT_CONFIRMED_STATUSES as readonly string[]).includes(order.status) &&
        order.source !== "pos",
    )
    .map((order) => order._id);
}

export interface ReceiptAutoPrintDecisionInput {
  /** Ids that entered the confirmed set since the last snapshot. */
  newIds: readonly string[];
  /** Order ids this device already auto-printed (persisted, FIFO-capped). */
  printedList: readonly string[];
  /** The merchant chose a trigger that fires on confirmation. */
  printsOnConfirmation: boolean;
  hasCashierPrinter: boolean;
  /** The read-only demo must never move paper on a real printer. */
  isDemo: boolean;
}

export function selectOrdersToAutoPrint(input: ReceiptAutoPrintDecisionInput): string[] {
  if (!input.printsOnConfirmation || !input.hasCashierPrinter || input.isDemo) return [];
  const printed = new Set(input.printedList);
  return input.newIds.filter((id) => !printed.has(id));
}
