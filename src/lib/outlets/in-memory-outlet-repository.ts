/**
 * An `OutletRepository` backed by a Map.
 *
 * Exists so the behavioural contract — ordering, tenant isolation, slug
 * uniqueness, soft deactivation — can be exercised without a live database,
 * and so a future second backend has an executable definition of "correct" to
 * be measured against. Not used by application code.
 */

import {
  assertOutletInvariants,
  compareOutlets,
  normalizeOutletWrite,
  OutletNotFoundError,
  OutletValidationError,
  type Outlet,
  type OutletPatch,
  type OutletRepository,
  type OutletWriteInput,
} from '@/lib/outlets/outlet-repository'

export function createInMemoryOutletRepository(): OutletRepository {
  const rows = new Map<string, Outlet>()
  let sequence = 0

  const forTenant = (tenantId: string): Outlet[] =>
    [...rows.values()].filter((row) => row.tenant_id === tenantId).sort(compareOutlets)

  const slugTaken = (tenantId: string, slug: string, exceptId?: string): boolean =>
    forTenant(tenantId).some(
      (row) => row.id !== exceptId && row.slug.toLowerCase() === slug.toLowerCase()
    )

  return {
    async listByTenant(tenantId) {
      return forTenant(tenantId)
    },

    async listActiveByTenant(tenantId) {
      return forTenant(tenantId).filter((row) => row.is_active)
    },

    async findBySlug(tenantId, slug) {
      const wanted = slug.trim().toLowerCase()
      return forTenant(tenantId).find((row) => row.slug.toLowerCase() === wanted) ?? null
    },

    async findById(tenantId, id) {
      const row = rows.get(id)
      return row && row.tenant_id === tenantId ? row : null
    },

    async create(tenantId, input: OutletWriteInput) {
      const normalized = { ...input, ...normalizeOutletWrite(input) } as OutletWriteInput
      assertOutletInvariants(normalized)

      if (slugTaken(tenantId, normalized.slug)) {
        throw new OutletValidationError(`The branch link "${normalized.slug}" is already in use.`)
      }

      const now = new Date().toISOString()
      const outlet: Outlet = {
        ...normalized,
        id: `outlet_${++sequence}`,
        tenant_id: tenantId,
        created_at: now,
        updated_at: now,
      }

      rows.set(outlet.id, outlet)
      return outlet
    },

    async update(tenantId, id, patch: OutletPatch) {
      const existing = rows.get(id)
      if (!existing || existing.tenant_id !== tenantId) {
        throw new OutletNotFoundError()
      }

      const normalized = normalizeOutletWrite(patch)
      const merged: Outlet = {
        ...existing,
        ...normalized,
        updated_at: new Date().toISOString(),
      }
      assertOutletInvariants(merged)

      if (normalized.slug !== undefined && slugTaken(tenantId, merged.slug, id)) {
        throw new OutletValidationError(`The branch link "${merged.slug}" is already in use.`)
      }

      rows.set(id, merged)
      return merged
    },

    async reorder(tenantId, orderedIds) {
      orderedIds.forEach((id, index) => {
        const row = rows.get(id)
        // Silently skipping foreign ids keeps a stale client list from
        // reshuffling another merchant's branches.
        if (!row || row.tenant_id !== tenantId) return
        rows.set(id, { ...row, sort_order: index, updated_at: new Date().toISOString() })
      })
    },
  }
}
