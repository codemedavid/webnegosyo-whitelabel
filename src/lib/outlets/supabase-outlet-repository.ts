/**
 * The `OutletRepository` backed by the platform Supabase database — where
 * every other catalog/config entity for a tenant already lives.
 *
 * Deliberately thin: all validation and normalization comes from
 * `outlet-repository.ts`, so this file only translates the interface into
 * PostgREST calls and translates database errors back into the two error types
 * callers handle. Storefront reads go through the RLS-enforcing server client
 * like the rest of the catalog; nothing here uses the service-role client.
 *
 * Read failures are surfaced, not swallowed. Silently degrading to "no
 * branches" would render the single-outlet flow for a multi-branch merchant and
 * send the order to the wrong kitchen — a loud error is the safe failure here.
 */

import { createClient } from '@/lib/supabase/server'
import {
  assertOutletInvariants,
  normalizeOutletWrite,
  OutletNotFoundError,
  OutletValidationError,
  OUTLET_SELECT,
  type Outlet,
  type OutletPatch,
  type OutletRepository,
  type OutletWriteInput,
} from '@/lib/outlets/outlet-repository'

/** Postgres unique-violation; the only DB error we translate for the merchant. */
const UNIQUE_VIOLATION = '23505'

interface PostgrestErrorLike {
  code?: string
  message?: string
}

function translateWriteError(error: PostgrestErrorLike, slug: string | undefined): Error {
  if (error.code === UNIQUE_VIOLATION) {
    return new OutletValidationError(
      slug
        ? `The branch link "${slug}" is already in use.`
        : 'That branch link is already in use.'
    )
  }
  return new Error(error.message ?? 'Could not save the branch.')
}

export function createSupabaseOutletRepository(): OutletRepository {
  return {
    async listByTenant(tenantId) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlets')
        .select(OUTLET_SELECT)
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Outlet[]
    },

    async listActiveByTenant(tenantId) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlets')
        .select(OUTLET_SELECT)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Outlet[]
    },

    async findBySlug(tenantId, slug) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlets')
        .select(OUTLET_SELECT)
        .eq('tenant_id', tenantId)
        // Slugs arrive from URLs, where casing is not guaranteed. The unique
        // index is on lower(slug), so this matches it exactly.
        .ilike('slug', slug.trim())
        .maybeSingle()

      if (error) throw new Error(error.message)
      return (data as unknown as Outlet) ?? null
    },

    async findById(tenantId, id) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlets')
        .select(OUTLET_SELECT)
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return (data as unknown as Outlet) ?? null
    },

    async create(tenantId, input: OutletWriteInput) {
      const normalized = { ...input, ...normalizeOutletWrite(input) } as OutletWriteInput
      assertOutletInvariants(normalized)

      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlets')
        .insert({ ...normalized, tenant_id: tenantId } as never)
        .select(OUTLET_SELECT)
        .single()

      if (error) throw translateWriteError(error, normalized.slug)
      return data as unknown as Outlet
    },

    async update(tenantId, id, patch: OutletPatch) {
      const normalized = normalizeOutletWrite(patch)

      // Merge before validating so a patch that turns off the last fulfillment
      // mode, or clears half a coordinate pair, is caught here rather than
      // becoming a broken row.
      const existing = await this.findById(tenantId, id)
      if (!existing) throw new OutletNotFoundError()
      assertOutletInvariants({ ...existing, ...normalized })

      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlets')
        .update({ ...normalized, updated_at: new Date().toISOString() } as never)
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .select(OUTLET_SELECT)
        .single()

      if (error) throw translateWriteError(error, normalized.slug)
      if (!data) throw new OutletNotFoundError()
      return data as unknown as Outlet
    },

    async reorder(tenantId, orderedIds) {
      const supabase = await createClient()
      const now = new Date().toISOString()

      // One statement per row: the list is a handful of branches, and scoping
      // every write by tenant_id means a stale or hostile client list can only
      // ever reorder its own branches.
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from('outlets')
          .update({ sort_order: index, updated_at: now } as never)
          .eq('tenant_id', tenantId)
          .eq('id', id)

        if (error) throw new Error(error.message)
      }
    },
  }
}
