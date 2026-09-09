// The kitchen chit for a counter sale, printed BY THE REGISTER the instant the
// sale is written.
//
// It used to reach the kitchen printer only through the app-wide watcher,
// which learns about the order from its own subscription — a Convex push or,
// on platform-backend stores, a Realtime-triggered refetch. Both are round
// trips through the server for an order this very device just created, and
// on a busy counter that read as "auto-print takes forever". The register
// already holds every line of the sale; it claims the chit in the shared
// ledger and prints it now, and the watcher finds the claim and stays quiet.

import { usePrinterStore } from "../stores/printer-store";
import { printersForRole } from "./printer-registry";
import { printForRole } from "./printer";
import { buildKitchenChitSegments } from "./kitchen-chit";
import { claimPrinted } from "./printed-ledger";
import type { PosOrderArgs } from "./pos-order";

export interface PosKitchenPrintDeps {
  /** Whether the device auto-prints kitchen chits at all. */
  kitchenAutoPrint: boolean;
  hasKitchenPrinter: boolean;
  isDemo: boolean;
}

/** The same gate the watcher applies, read off the stores at call time. */
export function readPosKitchenPrintDeps(isDemo: boolean): PosKitchenPrintDeps {
  const { kitchenAutoPrint, printers } = usePrinterStore.getState();
  return {
    kitchenAutoPrint,
    hasKitchenPrinter: printersForRole(printers, "kitchen").length > 0,
    isDemo,
  };
}

export function shouldPrintPosKitchenChit(deps: PosKitchenPrintDeps): boolean {
  return deps.kitchenAutoPrint && deps.hasKitchenPrinter && !deps.isDemo;
}

/**
 * Print the chit for a sale just written. Never throws — the sale is already
 * in the drawer, and a dead kitchen printer only logs. Returns whether paper
 * came out.
 */
export async function printPosKitchenChit(
  orderId: string,
  args: PosOrderArgs,
  createdAt: number,
  deps: PosKitchenPrintDeps,
): Promise<boolean> {
  if (!shouldPrintPosKitchenChit(deps)) return false;

  try {
    const claimed = await claimPrinted("kitchen", [orderId]);
    if (claimed.length === 0) return false;

    const outcome = await printForRole(
      "kitchen",
      buildKitchenChitSegments({
        _id: orderId,
        _creationTime: createdAt,
        customerName: args.customerName,
        orderType: args.orderType,
        items: args.items.map((item) => ({
          menuItemName: item.menuItemName,
          quantity: item.quantity,
          variationSelections: item.variationSelections,
          specialInstructions: item.specialInstructions,
        })),
      }),
    );
    if (!outcome.anySuccess) {
      console.warn(
        "[pos] Kitchen chit failed for sale",
        orderId,
        outcome.results[0]?.result.error ?? "no kitchen printer",
      );
    }
    return outcome.anySuccess;
  } catch (err: unknown) {
    console.warn("[pos] Kitchen chit failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
