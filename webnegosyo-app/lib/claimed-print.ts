// Print one order this caller has CLAIMED in the printed ledger, and give the
// claim back when no paper came out.
//
// Every automatic print (GlobalKitchenAutoPrint, GlobalReceiptAutoPrint, the
// register's own chit in pos-kitchen-print.ts) claims BEFORE printing, so two
// surfaces never print one order twice and a crash mid-print is never a
// reprint loop. A print that came back FAILED used to keep its claim, and the
// cashier's manual retry then read *** REPRINT *** on the only copy. Like the
// manual chit (kitchen-chit-reprint.ts), a failure now releases.
//
// Only the claimer calls this, only for ids its claim returned, so a loser of
// a claim race never prints and never releases someone else's claim. Success
// keeps the claim. The watchers do not retry by themselves: their dedupe is
// the ids they have SEEN, so a released order prints again only from a manual
// print (or a watcher that remounted and sees it for the first time).

import { releasePrinted, type PrintedLedgerKind } from "./printed-ledger";

/** Returns whether paper came out. Never throws. */
export async function printClaimed(
  kind: PrintedLedgerKind,
  orderId: string,
  print: () => Promise<boolean>,
): Promise<boolean> {
  let isPrinted = false;
  try {
    isPrinted = await print();
  } catch (err: unknown) {
    console.warn(`[print] ${kind} print threw for order`, orderId, err instanceof Error ? err.message : err);
  }
  if (isPrinted) return true;
  try {
    await releasePrinted(kind, [orderId]);
  } catch {
    // The ledger is memory first; a failed persist only risks a REPRINT stamp.
  }
  return false;
}
