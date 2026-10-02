import type { SupabaseClient } from '@supabase/supabase-js'
import type { DomainPatch, DomainStore, TenantDomainRow } from '@/lib/domains/custom-domain-service'

/**
 * `DomainStore` over the tenants table. Requires the SERVICE-ROLE client:
 * the domain columns are privileged, so an owner's own session cannot write
 * them — the server action authorizes first, then writes through this.
 */

const COLUMNS = 'id, slug, domain, pending_domain, pending_domain_token, pending_domain_claimed_at, domain_verified_at'
const UNIQUE_VIOLATION = '23505'

interface DomainColumns {
  id: string
  slug: string
  domain: string | null
  pending_domain: string | null
  pending_domain_token: string | null
  pending_domain_claimed_at: string | null
  domain_verified_at: string | null
}

const PATCH_COLUMNS: Record<keyof DomainPatch, keyof DomainColumns> = {
  domain: 'domain',
  pendingDomain: 'pending_domain',
  pendingToken: 'pending_domain_token',
  pendingClaimedAt: 'pending_domain_claimed_at',
  domainVerifiedAt: 'domain_verified_at',
}

function fromRow(row: DomainColumns): TenantDomainRow {
  return {
    id: row.id,
    slug: row.slug,
    domain: row.domain || null,
    pendingDomain: row.pending_domain || null,
    pendingToken: row.pending_domain_token,
    pendingClaimedAt: row.pending_domain_claimed_at,
    domainVerifiedAt: row.domain_verified_at,
  }
}

function toColumns(patch: DomainPatch): Record<string, string | null> {
  return Object.fromEntries(
    (Object.keys(patch) as Array<keyof DomainPatch>)
      .filter((key) => patch[key] !== undefined)
      .map((key) => [PATCH_COLUMNS[key], patch[key] ?? null]),
  )
}

// The generated DB types lag this migration, so the table is addressed untyped.
export function createSupabaseDomainStore(admin: SupabaseClient): DomainStore {
  const tenants = () => admin.from('tenants')

  return {
    async getTenant(tenantId) {
      const { data, error } = await tenants().select(COLUMNS).eq('id', tenantId).maybeSingle()
      if (error) throw new Error(`Could not load the store's domain: ${error.message}`)
      return data ? fromRow(data as DomainColumns) : null
    },

    async findHolder(domain, excludeTenantId) {
      // `domain` is already normalized (lowercase, validated charset), so it is
      // safe inside the PostgREST `or` filter.
      const { data, error } = await tenants()
        .select(COLUMNS)
        .or(`domain.eq.${domain},pending_domain.eq.${domain}`)
        .neq('id', excludeTenantId)
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`Could not check who holds the domain: ${error.message}`)
      return data ? fromRow(data as DomainColumns) : null
    },

    async update(tenantId, patch) {
      const { error } = await tenants().update(toColumns(patch)).eq('id', tenantId)
      if (!error) return { ok: true }
      return { ok: false, isConflict: error.code === UNIQUE_VIOLATION, message: error.message }
    },
  }
}
