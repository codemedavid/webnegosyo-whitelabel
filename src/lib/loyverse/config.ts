/**
 * Loyverse per-tenant configuration resolution.
 *
 * Pure module — no network, no Supabase — so the readiness rules are unit
 * testable and shared by the server actions, the API route, and the
 * superadmin form.
 */

export const LOYVERSE_PUSH_MODES = ['on_create', 'on_confirm'] as const
export type LoyversePushMode = (typeof LOYVERSE_PUSH_MODES)[number]

/** Subset of tenant columns the integration reads. */
export interface LoyverseTenantFields {
  loyverse_enabled?: boolean | null
  loyverse_access_token?: string | null
  loyverse_store_id?: string | null
  loyverse_payment_type_id?: string | null
  loyverse_push_mode?: string | null
}

export interface LoyverseConfig {
  accessToken: string
  storeId: string
  /** Null = push receipts without a payment line; merchant settles in Loyverse. */
  paymentTypeId: string | null
  pushMode: LoyversePushMode
}

export type LoyverseConfigResult =
  | { status: 'disabled' }
  | { status: 'incomplete'; missing: string[] }
  | { status: 'ready'; config: LoyverseConfig }

/**
 * Unknown or missing values fall back to on_confirm: pushing a receipt only
 * after a human confirms is the conservative behaviour, so a bad stored value
 * must never silently opt a tenant into automatic pushes.
 */
export function resolveLoyversePushMode(value: string | null | undefined): LoyversePushMode {
  return (LOYVERSE_PUSH_MODES as readonly string[]).includes(value ?? '')
    ? (value as LoyversePushMode)
    : 'on_confirm'
}

function presence(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function resolveLoyverseConfig(tenant: LoyverseTenantFields): LoyverseConfigResult {
  if (!tenant.loyverse_enabled) return { status: 'disabled' }

  const accessToken = presence(tenant.loyverse_access_token)
  const storeId = presence(tenant.loyverse_store_id)

  const missing: string[] = []
  if (!accessToken) missing.push('loyverse_access_token')
  if (!storeId) missing.push('loyverse_store_id')
  if (missing.length > 0) return { status: 'incomplete', missing }

  return {
    status: 'ready',
    config: {
      accessToken: accessToken as string,
      storeId: storeId as string,
      paymentTypeId: presence(tenant.loyverse_payment_type_id),
      pushMode: resolveLoyversePushMode(tenant.loyverse_push_mode),
    },
  }
}
