/**
 * What a reprint says was paid.
 *
 * An order can be settled by its status with an empty ledger (paid online, or
 * handed over), so a settled order reads as paid in full. An order still owing
 * reads its ledger, and an unreadable ledger leaves the receipt silent rather
 * than printing "Amount due" on money that may have been taken.
 */
export interface ReceiptPaidInput {
  isUnpaid: boolean;
  total: number;
  /** Net of the settlement ledger; undefined when it cannot be trusted. */
  ledgerPaid: number | undefined;
}

export function receiptAmountPaid({ isUnpaid, total, ledgerPaid }: ReceiptPaidInput): number | undefined {
  if (!isUnpaid) return total;
  return ledgerPaid;
}
