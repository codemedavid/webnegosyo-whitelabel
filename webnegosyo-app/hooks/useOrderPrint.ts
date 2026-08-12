import { useState, useCallback } from "react";
import { usePrinterStore } from "../stores/printer-store";
import { useAuthStore } from "../stores/auth-store";
import { printReceipt } from "../lib/printer";
import { formatReceipt } from "../lib/receipt-formatter";
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
  const { printTrigger, printer } = usePrinterStore();
  const [isPrinting, setIsPrinting] = useState(false);

  const printOrder = useCallback(
    async (order: PrintableOrder): Promise<boolean> => {
      if (!printer) return false;

      setIsPrinting(true);
      try {
        const receipt = formatReceipt(order, { storeName: tenantName ?? "Store" });
        const result = await printReceipt(receipt);
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
    [printer, tenantName]
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
