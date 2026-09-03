import {
  renderReceipt,
  renderReceiptSegments,
  resolveReceiptLayout,
  type ReceiptOrder,
  type ReceiptSegment,
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

/**
 * Segment form of buildReceiptText for printers that can raster a QR. When no
 * tracking URL was minted the qr block goes silent and the receipt prints as
 * plain text — never a broken or placeholder QR.
 */
export function buildReceiptSegments(
  order: ReceiptOrder,
  storeName: string,
  savedLayout: unknown,
  trackingUrl: string | null,
  logoUrl: string | null = null,
): ReceiptSegment[] {
  return renderReceiptSegments(
    order,
    {
      storeName,
      ...(trackingUrl ? { trackingUrl } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    },
    resolveReceiptLayout(savedLayout),
  );
}

/**
 * Whether this tenant's layout prints a QR at all — callers skip the
 * tracking-URL round trip entirely when it doesn't (Classic tenants never pay
 * a network hop at print time).
 */
export function layoutWantsQr(savedLayout: unknown): boolean {
  return resolveReceiptLayout(savedLayout).blocks.some((b) => b.kind === "qr");
}
