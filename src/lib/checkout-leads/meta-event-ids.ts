/**
 * Event ids the funnel's browser pixel and server (Conversions API) share, so
 * Meta counts each pair once. Browser-safe: no server imports here.
 */

/** The one Purchase event id per lead. */
export function purchaseEventId(referenceNumber: string): string {
  return `purchase_${referenceNumber}`
}
