import { useState, useCallback } from "react";
import { usePrinterStore } from "../stores/printer-store";
import { useAuthStore } from "../stores/auth-store";
import { printForRole } from "../lib/printer";
import { getAccessTokenBounded } from "../lib/authorized-post";
import { printersForRole, DEFAULT_PAPER_WIDTH } from "../lib/printer-registry";
import { charsForPaperWidth } from "../lib/receipt-escpos";
import { buildReceiptSegments, layoutWantsQr } from "../lib/receipt-print";
import { fetchTrackingUrl } from "../lib/receipt-tracking";
import { shouldPrintAt, type PrintMoment } from "../lib/print-trigger";
import type { ReceiptOrder } from "../lib/receipt-layout";

/** A session read that takes longer than this is a stalled refresh, not a slow one. */
const SESSION_READ_TIMEOUT_MS = 3_000;

/**
 * Whatever the receipt renderer can print — no narrower.
 *
 * This was once a hand-copied subset, and every field it forgot (the service
 * charge, the discount blob) was silently dropped from the paper by the
 * excess-property check at each call site. Aliasing the renderer's own type
 * means a field added there reaches the printer without a second edit.
 */
type PrintableOrder = ReceiptOrder;

/**
 * Shared hook for printing order receipts.
 * Used by both the order detail screen and the orders list to avoid duplicating
 * print logic (formatReceipt + printReceipt + store access).
 */
export function useOrderPrint() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const tenantId = useAuthStore((s) => s.tenantId);
  const receiptLayout = useAuthStore((s) => s.receiptLayout);
  const receiptLogoUrl = useAuthStore((s) => s.receiptLogoUrl);
  const printTrigger = usePrinterStore((s) => s.printTrigger);
  const printers = usePrinterStore((s) => s.printers);
  // The receipt is the cashier's paper; a device whose printers are all
  // kitchen-role has nothing to print it on.
  const cashierPrinter = printersForRole(printers, "cashier")[0];
  const hasCashierPrinter = cashierPrinter !== undefined;
  // The receipt goes to the first cashier printer, so its paper sets the columns.
  const paperColumns = charsForPaperWidth(cashierPrinter?.paperWidth ?? DEFAULT_PAPER_WIDTH);
  const [isPrinting, setIsPrinting] = useState(false);

  const printOrder = useCallback(
    async (order: PrintableOrder): Promise<boolean> => {
      if (!hasCashierPrinter) return false;

      setIsPrinting(true);
      try {
        // The QR needs a server-minted signed URL; skipped entirely for
        // layouts without a qr block, and best-effort otherwise — a failed
        // mint prints a QR-less receipt rather than no receipt.
        let trackingUrl: string | null = null;
        if (tenantId && layoutWantsQr(receiptLayout)) {
          // Bounded on purpose: this sits between "Confirm" and the first
          // line of paper, and an unbounded session read here is the same
          // freeze the tender screen already had (see authorized-post.ts).
          const accessToken = await getAccessTokenBounded(SESSION_READ_TIMEOUT_MS);
          trackingUrl = await fetchTrackingUrl(
            { orderId: order._id, tenantId },
            { accessToken },
          );
        }

        const segments = buildReceiptSegments(
          order,
          tenantName ?? "Store",
          receiptLayout,
          trackingUrl,
          receiptLogoUrl,
          paperColumns,
        );
        const outcome = await printForRole("cashier", segments);
        if (!outcome.anySuccess) {
          const firstError = outcome.results[0]?.result.error;
          console.warn("[useOrderPrint] Print failed:", firstError ?? "no cashier printer");
        }
        return outcome.anySuccess;
      } catch (err: unknown) {
        console.warn("[useOrderPrint] Print failed:", err instanceof Error ? err.message : err);
        return false;
      } finally {
        setIsPrinting(false);
      }
    },
    [hasCashierPrinter, paperColumns, tenantName, tenantId, receiptLayout, receiptLogoUrl]
  );

  /**
   * Should this moment print, given the merchant's setting and this device?
   * A device with no printer never prints, whatever the setting says.
   */
  const shouldPrint = useCallback(
    (moment: PrintMoment): boolean => hasCashierPrinter && shouldPrintAt(moment, printTrigger),
    [hasCashierPrinter, printTrigger],
  );

  /**
   * Print if this moment calls for it. Returns whether paper came out, so a
   * caller can warn — never throws, so a dead printer cannot block a sale.
   */
  const printAt = useCallback(
    async (moment: PrintMoment, order: PrintableOrder): Promise<boolean> => {
      if (!shouldPrint(moment)) return false;
      return printOrder(order);
    },
    [shouldPrint, printOrder],
  );

  return {
    printOrder,
    printAt,
    shouldPrint,
    isPrinting,
    printTrigger,
    hasPrinter: hasCashierPrinter,
  };
}
