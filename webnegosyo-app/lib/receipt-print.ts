import {
  renderReceipt,
  renderReceiptSegments,
  resolveReceiptLayout,
  type ReceiptOrder,
  type ReceiptSegment,
  type ReceiptTaxIdentity,
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
  /** The store's tax registration; absent prints the receipt as it always was. */
  tax?: ReceiptTaxIdentity,
): string {
  return renderReceipt(
    order,
    { storeName, ...(tax ? { tax } : {}) },
    resolveReceiptLayout(savedLayout),
  );
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
  /** Text columns of the paper — 32 on 58mm, 48 on 80mm. A layout's own width wins. */
  width?: number,
  /**
   * The store's tax registration (TIN header, VAT block, not-an-invoice
   * notice). Absent for a store that never set up Tax & discounts.
   */
  tax?: ReceiptTaxIdentity,
): ReceiptSegment[] {
  return renderReceiptSegments(
    order,
    {
      storeName,
      ...(trackingUrl ? { trackingUrl } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(tax ? { tax } : {}),
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
