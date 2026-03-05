import { useState, useCallback } from "react";
import { usePrinterStore } from "../stores/printer-store";
import { useAuthStore } from "../stores/auth-store";
import { printReceipt } from "../lib/printer";
import { formatReceipt } from "../lib/receipt-formatter";

interface PrintableOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  orderType?: string;
  total: number;
  deliveryFee?: number;
  paymentMethod?: string;
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
  const { autoPrint, printer } = usePrinterStore();
  const [isPrinting, setIsPrinting] = useState(false);

  const printOrder = useCallback(
    async (order: PrintableOrder): Promise<boolean> => {
      if (!printer) return false;

      setIsPrinting(true);
      try {
        const receipt = formatReceipt(order, { storeName: tenantName ?? "Store" });
        const printed = await printReceipt(receipt);
        return printed;
      } catch (err: unknown) {
        console.warn("[useOrderPrint] Print failed:", err instanceof Error ? err.message : err);
        return false;
      } finally {
        setIsPrinting(false);
      }
    },
    [printer, tenantName]
  );

  return {
    printOrder,
    isPrinting,
    autoPrint,
    hasPrinter: !!printer,
  };
}
