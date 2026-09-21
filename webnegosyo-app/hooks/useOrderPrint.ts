import { useState, useCallback, useEffect, useRef } from "react";
import { usePrinterStore } from "../stores/printer-store";
import { useAuthStore } from "../stores/auth-store";
import { printForRole, type PrintSegment } from "../lib/printer";
import { getAccessTokenBounded } from "../lib/authorized-post";
import { printersForRole, DEFAULT_PAPER_WIDTH } from "../lib/printer-registry";
import { charsForPaperWidth } from "../lib/receipt-escpos";
import { buildReceiptSegments, layoutWantsQr } from "../lib/receipt-print";
import { fetchTrackingUrl, getCachedTrackingUrl } from "../lib/receipt-tracking";
import { isOffline } from "../lib/offline/connectivity";
import { isSaleQueued } from "../lib/offline/order-outbox";
import { prefetchLogo } from "../lib/receipt-logo";
import { shouldPrintAt, type PrintMoment } from "../lib/print-trigger";
import type { ReceiptOrder } from "../lib/receipt-layout";

/** A session read that takes longer than this is a stalled refresh, not a slow one. */
const SESSION_READ_TIMEOUT_MS = 3_000;

/** How long "Printed" stays on the button before it reads "Reprint" again. */
export const PRINTED_FEEDBACK_MS = 2_500;

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
 * What the last tap did, for the button that was tapped. `printing` is the
 * window in which a second tap must be ignored — the cashier used to have no
 * way to tell whether the first one had registered, so they tapped again and
 * got two receipts.
 */
export interface PrintFeedback {
  orderId: string;
  status: "printing" | "printed" | "failed";
}

/**
 * Shared hook for printing order receipts.
 * Used by the order detail screen, the orders list, the register and the
 * confirmation watcher, so every surface prints through one path.
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
  const [feedback, setFeedback] = useState<PrintFeedback | null>(null);
  // One print per order at a time: a double tap joins the print in flight
  // instead of queueing a second receipt behind it.
  const inFlightRef = useRef(new Map<string, Promise<boolean>>());
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The logo is the one network hop the receipt cannot avoid — pay it the
  // moment the tenant is known, not while the customer is waiting.
  useEffect(() => {
    if (hasCashierPrinter) prefetchLogo(receiptLogoUrl);
  }, [receiptLogoUrl, hasCashierPrinter]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  /**
   * The signed tracking URL, from memory when this order has printed before.
   * Best-effort otherwise: a failed mint prints a QR-less receipt, never no
   * receipt.
   */
  const resolveTrackingUrl = useCallback(
    async (orderId: string): Promise<string | null> => {
      if (!tenantId || !layoutWantsQr(receiptLayout)) return null;
      const ref = { orderId, tenantId };
      const cached = getCachedTrackingUrl(ref);
      if (cached) return cached;
      // No connection, or a sale the server has not been told about yet:
      // there is no tracking page to point at, so the QR block is skipped and
      // the rest of the receipt prints at once instead of after two timeouts.
      if (isOffline() || isSaleQueued(orderId)) return null;
      // Bounded on purpose: this sits between the tap and the first line of
      // paper, and an unbounded session read here is the same freeze the
      // tender screen already had (see authorized-post.ts).
      const accessToken = await getAccessTokenBounded(SESSION_READ_TIMEOUT_MS);
      return fetchTrackingUrl(ref, { accessToken });
    },
    [tenantId, receiptLayout],
  );

  const buildSegments = useCallback(
    async (order: PrintableOrder): Promise<PrintSegment[]> => {
      const trackingUrl = await resolveTrackingUrl(order._id);
      return buildReceiptSegments(
        order,
        tenantName ?? "Store",
        receiptLayout,
        trackingUrl,
        receiptLogoUrl,
        paperColumns,
      );
    },
    [resolveTrackingUrl, tenantName, receiptLayout, receiptLogoUrl, paperColumns],
  );

  const showFeedback = useCallback((next: PrintFeedback) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback(next);
    if (next.status === "printing") return;
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback((current) => (current?.orderId === next.orderId ? null : current));
    }, PRINTED_FEEDBACK_MS);
  }, []);

  const printOrder = useCallback(
    async (order: PrintableOrder): Promise<boolean> => {
      if (!hasCashierPrinter) return false;

      const inFlight = inFlightRef.current.get(order._id);
      if (inFlight) return inFlight;

      const job = (async () => {
        showFeedback({ orderId: order._id, status: "printing" });
        try {
          // The logo download runs alongside the tracking mint and the
          // Bluetooth handshake; the queue connects first and only then
          // waits for the receipt to finish building.
          prefetchLogo(receiptLogoUrl);
          const outcome = await printForRole("cashier", buildSegments(order));
          if (!outcome.anySuccess) {
            const firstError = outcome.results[0]?.result.error;
            console.warn("[useOrderPrint] Print failed:", firstError ?? "no cashier printer");
          }
          showFeedback({ orderId: order._id, status: outcome.anySuccess ? "printed" : "failed" });
          return outcome.anySuccess;
        } catch (err: unknown) {
          console.warn("[useOrderPrint] Print failed:", err instanceof Error ? err.message : err);
          showFeedback({ orderId: order._id, status: "failed" });
          return false;
        } finally {
          inFlightRef.current.delete(order._id);
        }
      })();
      inFlightRef.current.set(order._id, job);
      return job;
    },
    [hasCashierPrinter, receiptLogoUrl, buildSegments, showFeedback],
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
    /** The last tap's outcome, keyed by order — drive the button off this. */
    feedback,
    isPrinting: feedback?.status === "printing",
    printTrigger,
    hasPrinter: hasCashierPrinter,
  };
}
