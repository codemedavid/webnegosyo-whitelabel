/**
 * The dish cost field persists only through Convex (`productCosts`). Which
 * store gets it is the order backend's call — never the bare presence of a
 * `convex_deployment_url`, which platform stores can carry as a leftover.
 */

import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'

export function dishCostConvexUrl(tenant: OrderBackendTenantFields): string | undefined {
  if (resolveOrderBackend(tenant) !== 'convex') return undefined
  return tenant.convex_deployment_url ?? undefined
}
