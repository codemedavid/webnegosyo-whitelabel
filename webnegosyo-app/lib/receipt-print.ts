import {
  renderReceipt,
  resolveReceiptLayout,
  type ReceiptOrder,
} from "./receipt-layout";

/**
 * Render the receipt text the printer will receive, honouring whatever layout
 * the tenant saved (a preset name, a custom block stack, or nothing at all).
 * Anything unrecognised falls back to the Classic preset — a bad row in the
 * database must never stop paper coming out.
 */
export function buildReceiptText(
  order: ReceiptOrder,
  storeName: string,
  savedLayout: unknown,
): string {
  return renderReceipt(order, { storeName }, resolveReceiptLayout(savedLayout));
}
