/**
 * An `OutletMenuRepository` backed by a Map.
 *
 * Exists so the behavioural contract — merge semantics, tenant isolation, and
 * above all "an override that overrides nothing leaves no row" — can be
 * exercised without a live database, and so a second backend has an executable
 * definition of correct. Not used by application code.
 */

import {
  INHERITED_OVERRIDE,
  mergeOutletMenuOverride,
  overridesNothing,
  type OutletMenuOverride,
  type OutletMenuOverridePatch,
  type OutletMenuOverrideValues,
  type OutletMenuRepository,
} from '@/lib/outlets/outlet-menu-repository'

const key = (tenantId: string, outletId: string, menuItemId: string): string =>
  `${tenantId}::${outletId}::${menuItemId}`

export function createInMemoryOutletMenuRepository(): OutletMenuRepository {
  const rows = new Map<string, OutletMenuOverride>()
  let sequence = 0
  // Stamped rather than read from the clock: `Date.now()` in a fixture makes a
  // test that passes at one moment and not another.
  const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()

  const forTenant = (tenantId: string): OutletMenuOverride[] =>
    [...rows.values()].filter((row) => row.tenant_id === tenantId)

  const currentValues = (k: string): OutletMenuOverrideValues => {
    const row = rows.get(k)
    if (!row) return { ...INHERITED_OVERRIDE }
    return {
      is_listed: row.is_listed,
      is_available: row.is_available,
      price: row.price,
      discounted_price: row.discounted_price,
      discount_cleared: row.discount_cleared,
    }
  }

  return {
    async listByTenant(tenantId) {
      return forTenant(tenantId)
    },

    async listByOutlet(tenantId, outletId) {
      return forTenant(tenantId).filter((row) => row.outlet_id === outletId)
    },

    async listByMenuItem(tenantId, menuItemId) {
      return forTenant(tenantId).filter((row) => row.menu_item_id === menuItemId)
    },

    async save(tenantId, outletId, menuItemId, patch: OutletMenuOverridePatch) {
      const k = key(tenantId, outletId, menuItemId)
      const merged = mergeOutletMenuOverride(currentValues(k), patch)

      if (overridesNothing(merged)) {
        rows.delete(k)
        return null
      }

      const existing = rows.get(k)
      sequence += 1
      const saved: OutletMenuOverride = {
        id: existing?.id ?? `omi-${sequence}`,
        tenant_id: tenantId,
        outlet_id: outletId,
        menu_item_id: menuItemId,
        ...merged,
        created_at: existing?.created_at ?? stamp(sequence),
        updated_at: stamp(sequence),
      }
      rows.set(k, saved)
      return saved
    },

    async clear(tenantId, outletId, menuItemId) {
      rows.delete(key(tenantId, outletId, menuItemId))
    },
  }
}
