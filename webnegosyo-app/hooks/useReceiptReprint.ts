import { useCallback } from "react";
import { useOrderPrint } from "./useOrderPrint";
import { useAuthStore } from "../stores/auth-store";
import { usePrinterStore } from "../stores/printer-store";
import type { ReceiptOrder } from "../lib/receipt-layout";
import { reprintTargets } from "../lib/reprint-gate";
import { markReprint } from "../lib/receipt-reprint";
import { reportReceiptReprint } from "../lib/staff-activity/report-receipt-reprint";

/** What the audit line needs beyond the receipt itself. */
export interface ReprintFacts {
  dailyNumber?: number | null;
  outletId?: string | null;
}

/**
 * Print a receipt AGAIN, by hand: the copy says "*** REPRINT ***" and when
 * (never a new number), goes to the receipt printer the cashier picked (or
 * the only one), and — once the paper is out — files a `receipt.reprinted`
 * Store Activity line without making the cashier wait for it.
 *
 * Auto-print and the register's first print go through useOrderPrint
 * directly and stay unmarked.
 */
export function useReceiptReprint() {
  const { printOrder, feedback } = useOrderPrint();
  const printers = usePrinterStore((s) => s.printers);
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);

  const reprint = useCallback(
    async (order: ReceiptOrder, facts: ReprintFacts = {}, printerId?: string): Promise<boolean> => {
      const isPrinted = await printOrder(markReprint(order, Date.now()), { printerId });
      if (isPrinted && !isDemo) {
        // Fire-and-forget: the paper is out; the audit line never holds the till.
        void reportReceiptReprint(tenantId, {
          backend: orderBackend ?? "convex",
          orderId: order._id,
          dailyNumber: facts.dailyNumber,
          outletId: facts.outletId,
        });
      }
      return isPrinted;
    },
    [printOrder, isDemo, tenantId, orderBackend],
  );

  return {
    reprint,
    /** A FIRST print, unmarked (a sale whose receipt never came out). */
    print: printOrder,
    /** The last tap's outcome, keyed by order id. */
    feedback,
    /** Receipt printers on this device, for the picker. */
    targets: reprintTargets(printers),
    printers,
  };
}
