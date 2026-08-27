import { useState, useCallback } from "react";
import { usePrinterStore } from "../stores/printer-store";
import { useAuthStore } from "../stores/auth-store";
import { printReceiptSegments } from "../lib/printer";
import { buildReceiptSegments, layoutWantsQr } from "../lib/receipt-print";
import { fetchTrackingUrl } from "../lib/receipt-tracking";
import { supabase } from "../lib/supabase";
import { shouldPrintAt, type PrintMoment } from "../lib/print-trigger";

interface PrintableOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  orderType?: string;
  total: number;
  deliveryFee?: number;
  paymentMethod?: string;
  // POS counter sales — printed as the receipt's CASH/CHANGE block.
  cashTendered?: number;
  changeDue?: number;
  paymentReference?: string;
  items?: {
    menuItemName: string;
    quantity: number;
    subtotal: number;
    variation?: string;
    variationSelections?: { typeName: string; optionName: string }[];
    addons?: { name: string; price: number }[];
    specialInstructions?: string;
  }[];
}

/**
 * Shared hook for printing order receipts.
 * Used by both the order detail screen and the orders list to avoid duplicating
 * print logic (formatReceipt + printReceipt + store access).
 */
export function useOrderPrint() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const tenantId = useAuthStore((s) => s.tenantId);
  const receiptLayout = useAuthStore((s) => s.receiptLayout);
  const { printTrigger, printer } = usePrinterStore();
  const [isPrinting, setIsPrinting] = useState(false);

  const printOrder = useCallback(
    async (order: PrintableOrder): Promise<boolean> => {
      if (!printer) return false;

      setIsPrinting(true);
      try {
        // The QR needs a server-minted signed URL; skipped entirely for
        // layouts without a qr block, and best-effort otherwise — a failed
        // mint prints a QR-less receipt rather than no receipt.
        let trackingUrl: string | null = null;
        if (tenantId && layoutWantsQr(receiptLayout)) {
          const { data } = await supabase.auth.getSession();
          trackingUrl = await fetchTrackingUrl(
            { orderId: order._id, tenantId },
            { accessToken: data.session?.access_token ?? null },
          );
        }

        const segments = buildReceiptSegments(
          order,
          tenantName ?? "Store",
          receiptLayout,
          trackingUrl,
        );
        const result = await printReceiptSegments(segments);
        if (!result.success) {
          console.warn("[useOrderPrint] Print failed:", result.error);
        }
        return result.success;
      } catch (err: unknown) {
        console.warn("[useOrderPrint] Print failed:", err instanceof Error ? err.message : err);
        return false;
      } finally {
        setIsPrinting(false);
      }
    },
    [printer, tenantName, tenantId, receiptLayout]
  );

  /**
   * Should this moment print, given the merchant's setting and this device?
   * A device with no printer never prints, whatever the setting says.
   */
  const shouldPrint = useCallback(
    (moment: PrintMoment): boolean => !!printer && shouldPrintAt(moment, printTrigger),
    [printer, printTrigger],
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
    hasPrinter: !!printer,
  };
}
