// What a platform staff account with `tenants.edit` may NOT change on a store:
// where its orders go. Pointing a store at another Convex deployment (or a new
// deploy key, or another backend) would route its customers' orders and
// personal data somewhere else, so those stay with a full superadmin. Details,
// feature flags, deploys and integrations remain staff-editable.
//
// The custom domain is not here because the tenant form no longer writes it at
// all: `src/lib/domains/` (TXT ownership proof) is its only writer.
//
// Pure: the server action reads the stored row and refuses on a non-empty list.

import { orderBackendPreferenceOf, type OrderBackendPreference, type SelectableOrderBackend } from '@/lib/order-backend'

export interface StoredBackendRouting {
  convex_deployment_url?: string | null
  order_backend?: OrderBackendPreference | string | null
}

export interface RequestedBackendRouting {
  convex_deployment_url?: string | null
  order_backend?: SelectableOrderBackend | null
  /** Blank keeps the stored key, so only a non-blank value is a change. */
  convex_deploy_key?: string | null
}

const blankToNull = (value: string | null | undefined) => value?.trim() || null

/** Human labels of the superadmin-only fields this save would change. */
export function superadminOnlyTenantChanges(
  current: StoredBackendRouting | null,
  next: RequestedBackendRouting,
): string[] {
  const changes: string[] = []

  if (blankToNull(next.convex_deployment_url) !== blankToNull(current?.convex_deployment_url)) {
    changes.push('Convex deployment URL')
  }

  const storedPreference = orderBackendPreferenceOf({
    order_backend: (current?.order_backend ?? null) as OrderBackendPreference | null,
  })
  if ((next.order_backend ?? 'auto') !== storedPreference) changes.push('order backend')

  if (blankToNull(next.convex_deploy_key)) changes.push('Convex deploy key')

  return changes
}

export function superadminOnlyRefusal(changes: readonly string[]): string {
  return `Only a superadmin can change the ${changes.join(', ')}. Ask a superadmin to make this change.`
}
