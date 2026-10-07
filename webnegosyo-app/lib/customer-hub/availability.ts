/**
 * Whether this store gets customer figures at all.
 *
 * Mirrors `isCustomerHubOn` in `src/lib/customer-dashboard.ts`, which the
 * platform route enforces; the app asks the same question up front so a store
 * that is off sees the explanation at once instead of a spinner and a refusal.
 * A platform store's figures come straight from its own orders, so it is always
 * on; a store on its own Convex or Supabase waits for `customer_hub_enabled`.
 */

import { resolveOrderBackend, type OrderBackend, type OrderBackendTenantFields } from "../order-backend";

export function isCustomerHubOn(
  tenant: OrderBackendTenantFields & { customer_hub_enabled?: boolean | null },
): boolean {
  return tenant.customer_hub_enabled === true || resolveOrderBackend(tenant) === "platform";
}

/**
 * The same answer from the signed-in session. The resolved backend is checked
 * as well as the stored flag, so a session saved before platform stores were
 * switched on does not hide their dashboard until the next sign-in.
 */
export function selectIsCustomerHubOn(session: {
  customerHubEnabled: boolean;
  orderBackend: OrderBackend | null;
}): boolean {
  return session.customerHubEnabled || session.orderBackend === "platform";
}
