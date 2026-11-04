/**
 * A hand-printed kitchen chit ("Print kitchen chit" on the board and the
 * order screen), and whether it is a reprint.
 *
 * The device remembers every chit it has printed (lib/printed-ledger.ts). A
 * tap for an order already in that memory is a copy — marked REPRINT so the
 * cooks do not make it twice. The first chit for an order prints unmarked and
 * is claimed BEFORE the paper moves, so the auto-print watcher racing it does
 * not print it a second time.
 *
 * That claim is only kept once paper came out. With the kitchen printer off
 * the first chit never printed: keeping the claim would make the cashier's
 * retry say *** REPRINT *** on the only chit the kitchen ever gets, and the
 * cooks may skip it. So a failed first print gives its claim back.
 */

import type { KitchenChitOptions } from "./kitchen-chit";
import { claimPrinted, releasePrinted, type PrintedLedgerKind } from "./printed-ledger";

type Claim = (kind: PrintedLedgerKind, ids: readonly string[]) => Promise<string[]>;
type Release = (kind: PrintedLedgerKind, ids: readonly string[]) => Promise<void>;

export interface ManualChitLedger {
  claim: Claim;
  release: Release;
}

const DEVICE_LEDGER: ManualChitLedger = { claim: claimPrinted, release: releasePrinted };

/** Claim the order's chit; `isFirst` = this tap owns the first print. */
async function claimManualChit(
  orderId: string,
  nowMs: number,
  claim: Claim,
): Promise<{ options: KitchenChitOptions; isFirst: boolean }> {
  try {
    const fresh = await claim("kitchen", [orderId]);
    return fresh.length === 0 ? { options: { reprintAt: nowMs }, isFirst: false } : { options: {}, isFirst: true };
  } catch {
    // Unknown history: an unmarked chit is the safe one. A REPRINT stamp on
    // the only chit the kitchen ever gets could leave the order uncooked.
    // Nothing was recorded, so there is nothing to give back either.
    return { options: {}, isFirst: false };
  }
}

/**
 * Print the order's chit by hand. `print` builds and sends the chit with the
 * options given (REPRINT or not) and answers whether paper came out. Never
 * throws; answers whether it printed.
 */
export async function printManualKitchenChit(
  orderId: string,
  nowMs: number,
  print: (options: KitchenChitOptions) => Promise<boolean>,
  ledger: ManualChitLedger = DEVICE_LEDGER,
): Promise<boolean> {
  const { options, isFirst } = await claimManualChit(orderId, nowMs, ledger.claim);
  let isPrinted = false;
  try {
    isPrinted = await print(options);
  } catch {
    isPrinted = false;
  }
  if (!isPrinted && isFirst) {
    await ledger.release("kitchen", [orderId]).catch(() => {
      // Worst case the retry is stamped REPRINT, as before.
    });
  }
  return isPrinted;
}
