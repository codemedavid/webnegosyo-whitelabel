import { useCallback } from "react";
import { Alert } from "react-native";
import { useReceiptReprint } from "./useReceiptReprint";
import type { LastSale } from "../stores/pos-last-sale-store";

/**
 * The sale-complete banner's "Reprint": the receipt the register just built,
 * printed again from memory (works offline, no server round trip). Marked
 * REPRINT when the register already printed it; a sale whose receipt never
 * printed (print trigger off) gets its first, unmarked print instead.
 * Undefined on a device without a receipt printer, so the banner offers nothing.
 */
export function useLastSaleReprint(): ((sale: LastSale) => void) | undefined {
  const { reprint, print, targets } = useReceiptReprint();
  const hasReceiptPrinter = targets.length > 0;

  const onReprint = useCallback(
    (sale: LastSale) => {
      const receipt = sale.receipt;
      if (!receipt) return;
      const job = sale.isReceiptPrinted ? reprint(receipt) : print(receipt);
      void job.then((isPrinted) => {
        if (!isPrinted) Alert.alert("Print failed", "Check the receipt printer in Printer settings, then try again.");
      });
    },
    [reprint, print],
  );

  return hasReceiptPrinter ? onReprint : undefined;
}
