/**
 * The two switches that decide whether a store may say anything about stamps.
 *
 * Pure, and the ONE place the "unknown reads as shadow" rule lives: a flag that
 * could not be read must never put a store live, and every surface — the
 * server-side read, the tracking page and the checkout form — has to agree on
 * that or a customer gets promised a stamp the ledger will not issue.
 */

export interface LoyaltyTenantFlags {
  isEnabled: boolean
  isShadow: boolean
}

/** The loyalty columns as they come off a tenant row. */
export interface LoyaltyTenantRow {
  loyalty_enabled?: boolean | null
  loyalty_shadow?: boolean | null
}

export function readLoyaltyTenantFlags(row: LoyaltyTenantRow | null | undefined): LoyaltyTenantFlags {
  return {
    isEnabled: row?.loyalty_enabled === true,
    isShadow: row?.loyalty_shadow !== false,
  }
}

/** True only when the store earns for real — enabled AND out of shadow. */
export function isLoyaltyLive(row: LoyaltyTenantRow | null | undefined): boolean {
  const flags = readLoyaltyTenantFlags(row)
  return flags.isEnabled && !flags.isShadow
}
