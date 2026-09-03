import {
  CLASSIC_RECEIPT_LAYOUT,
  renderReceipt,
  type ReceiptConfig,
  type ReceiptOrder,
  type ReceiptOrderItem,
} from "./receipt-layout";

export type { ReceiptConfig, ReceiptOrder, ReceiptOrderItem };

/**
 * The historic single-format receipt. Kept as the stable entry point for
 * callers that don't care about layouts: it is exactly the Classic preset
 * rendered through the block engine in `receipt-layout.ts`, and the tests in
 * `receipt-formatter.test.ts` + `receipt-layout.test.ts` pin that equivalence
 * byte-for-byte.
 */
export function formatReceipt(order: ReceiptOrder, config: ReceiptConfig): string {
  return renderReceipt(order, config, CLASSIC_RECEIPT_LAYOUT);
}
