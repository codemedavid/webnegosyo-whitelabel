/**
 * The sale-complete banner's receipt: "Print receipt" until a receipt for the
 * sale really came out, "Reprint" (stamped REPRINT) after. Pure so both the
 * tender and the banner are tested (`last-sale-receipt.test.ts`).
 *
 * A print that was only SENT (printer off, out of range) is not a printed
 * receipt: stamping the cashier's first real copy REPRINT tells the customer
 * it is a duplicate.
 */

import type { LastSale } from "../stores/pos-last-sale-store";
import type { ReceiptOrder } from "./receipt-layout";

type MarkPrinted = (orderId: string) => void;

/** Follow the tender's print; mark the sale printed only once it succeeded. Never rejects. */
export function trackTenderReceiptPrint(
  orderId: string,
  job: Promise<boolean>,
  markPrinted: MarkPrinted,
): Promise<boolean> {
  return job
    .then((isPrinted) => {
      if (isPrinted) markPrinted(orderId);
      return isPrinted;
    })
    .catch(() => false);
}

export interface LastSaleReceiptDeps {
  print: (receipt: ReceiptOrder) => Promise<boolean>;
  reprint: (receipt: ReceiptOrder) => Promise<boolean>;
  /** The banner's sale as it is NOW (the tap's copy may be older). */
  latest: () => LastSale | null;
  markPrinted: MarkPrinted;
}

/**
 * The banner's button. A tap while the tender's print is still running waits
 * for it first, so the copy is marked by what really happened.
 */
export async function printLastSaleReceipt(sale: LastSale, deps: LastSaleReceiptDeps): Promise<boolean> {
  const receipt = sale.receipt;
  if (!receipt) return false;
  if (sale.receiptPrintJob) await sale.receiptPrintJob.catch(() => false);

  const current = deps.latest();
  const isAlreadyPrinted =
    current && current.orderId === sale.orderId ? Boolean(current.isReceiptPrinted) : Boolean(sale.isReceiptPrinted);
  let isPrinted = false;
  try {
    isPrinted = await (isAlreadyPrinted ? deps.reprint(receipt) : deps.print(receipt));
  } catch {
    isPrinted = false;
  }
  if (isPrinted) deps.markPrinted(sale.orderId);
  return isPrinted;
}
