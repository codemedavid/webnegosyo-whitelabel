/**
 * What the server last said each store's `pos_stock_policy` is, for this app
 * session. Fed by the ceilings read and by the stock clearance's answers, so
 * the tender knows a `warn` store needs no clearance round trip. No imports on
 * purpose: the ceilings reader and the clearance call both use it.
 */

export type RememberedStockPolicy = "warn" | "block";

const policies = new Map<string, RememberedStockPolicy>();

export function rememberStockPolicy(tenantId: string, policy: RememberedStockPolicy): void {
  policies.set(tenantId, policy);
}

export function knownStockPolicy(tenantId: string): RememberedStockPolicy | undefined {
  return policies.get(tenantId);
}

/** Tests only. */
export function forgetStockPolicies(): void {
  policies.clear();
}
