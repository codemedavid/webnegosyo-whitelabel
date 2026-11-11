import { useCallback } from "react";
import { Alert } from "react-native";
import { useReceiptReprint } from "./useReceiptReprint";
import { usePosLastSaleStore, type LastSale } from "../stores/pos-last-sale-store";
import { printLastSaleReceipt } from "../lib/last-sale-receipt";

/**
 * The sale-complete banner's "Reprint": the receipt the register just built,
 * printed again from memory (works offline, no server round trip). Marked
 * REPRINT only when a receipt for the sale really came out already; otherwise
 * (print trigger off, printer off at tender) it is the first, unmarked print,
 * and a success makes the next tap a REPRINT (lib/last-sale-receipt.ts).
 * Undefined on a device without a receipt printer, so the banner offers nothing.
 */
export function useLastSaleReprint(): ((sale: LastSale) => void) | undefined {
  const { reprint, print, targets } = useReceiptReprint();
  const hasReceiptPrinter = targets.length > 0;

  const onReprint = useCallback(
    (sale: LastSale) => {
      if (!sale.receipt) return;
      const { markReceiptPrinted } = usePosLastSaleStore.getState();
      void printLastSaleReceipt(sale, {
        print: (receipt) => print(receipt),
        reprint: (receipt) => reprint(receipt),
        latest: () => usePosLastSaleStore.getState().lastSale,
        markPrinted: markReceiptPrinted,
      }).then((isPrinted) => {
        if (!isPrinted) Alert.alert("Print failed", "Check the receipt printer in Printer settings, then try again.");
      });
    },
    [reprint, print],
  );

  return hasReceiptPrinter ? onReprint : undefined;
}
