/**
 * Is a hand-printed kitchen chit a reprint?
 *
 * The device remembers every chit it has printed (lib/printed-ledger.ts). A
 * tap on "Print kitchen chit" for an order already in that memory is a copy —
 * marked REPRINT so the cooks do not make it twice. The first chit for an order
 * prints unmarked and is claimed, so the auto-print watcher does not print it
 * again behind the cashier's back.
 */

import type { KitchenChitOptions } from "./kitchen-chit";
import { claimPrinted, type PrintedLedgerKind } from "./printed-ledger";

type Claim = (kind: PrintedLedgerKind, ids: readonly string[]) => Promise<string[]>;

export async function manualChitOptions(
  orderId: string,
  nowMs: number,
  claim: Claim = claimPrinted,
): Promise<KitchenChitOptions> {
  try {
    const fresh = await claim("kitchen", [orderId]);
    return fresh.length === 0 ? { reprintAt: nowMs } : {};
  } catch {
    // Unknown history: an unmarked chit is the safe one. A REPRINT stamp on
    // the only chit the kitchen ever gets could leave the order uncooked.
    return {};
  }
}
