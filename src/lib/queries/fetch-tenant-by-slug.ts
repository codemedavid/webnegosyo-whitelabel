/**
 * Resilient active-tenant lookup shared by the storefront and product detail pages.
 *
 * Both pages fetch the tenant with a long, explicit column projection so the payload
 * stays small (see `TENANT_STOREFRONT_SELECT` / `PRODUCT_DETAIL_TENANT_SELECT`).
 * PostgREST, however, rejects the *whole* query when a single projected column is
 * absent — which is exactly what happens in the window between deploying code that
 * reads a new branding column and applying its migration. The callers used to treat
 * that error as "no such tenant", so one pending migration rendered "Restaurant not
 * found" for every tenant on the platform.
 *
 * A missing branding column must degrade to a default, never take the shop offline.
 * On an undefined-column error we retry once with `*`, which cannot go stale.
 */

/** PostgREST surfaces Postgres `undefined_column` as SQLSTATE 42703. */
const UNDEFINED_COLUMN_CODE = '42703'

interface QueryError {
  code?: string
  message: string
}

interface TenantQueryBuilder {
  eq: (column: string, value: unknown) => TenantQueryBuilder
  maybeSingle: () => PromiseLike<{ data: unknown; error: QueryError | null }>
}

/**
 * Structural subset of the Supabase client this helper needs. Declared locally so
 * the module stays unit-testable with a fake client and free of server-only imports.
 *
 * Callers pass their generated `SupabaseClient` through `asTenantQueryClient` — the
 * generated builder types resolve the projection string into per-column types, which
 * cannot be expressed here and are not needed: rows are typed by the `T` generic,
 * exactly as the previous inline queries typed them.
 */
export interface TenantQueryClient {
  from: (table: string) => { select: (projection: string) => TenantQueryBuilder }
}

/** Narrow a generated Supabase client to the subset this helper uses. */
export function asTenantQueryClient(client: unknown): TenantQueryClient {
  return client as TenantQueryClient
}

export interface TenantFetchResult<T> {
  /** The tenant row, or null when it genuinely does not exist / the query failed. */
  tenant: T | null
  /** True when the row was recovered via the `*` fallback after a projection error. */
  isDegraded: boolean
  /** Non-null only for real failures — an absent tenant is not an error. */
  error: string | null
}

function queryActiveTenant(client: TenantQueryClient, slug: string, projection: string) {
  return client
    .from('tenants')
    .select(projection)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
}

export async function fetchActiveTenantBySlug<T>(
  client: TenantQueryClient,
  slug: string,
  projection: string
): Promise<TenantFetchResult<T>> {
  const { data, error } = await queryActiveTenant(client, slug, projection)

  if (!error) {
    return { tenant: (data as T | null) ?? null, isDegraded: false, error: null }
  }

  if (error.code !== UNDEFINED_COLUMN_CODE) {
    return { tenant: null, isDegraded: false, error: error.message }
  }

  console.error(
    `[fetch-tenant-by-slug] Tenant projection rejected for "${slug}" — a selected column is missing from the database (likely an unapplied migration). Falling back to a full-row read. Original error: ${error.message}`
  )

  const fallback = await queryActiveTenant(client, slug, '*')

  if (fallback.error) {
    return { tenant: null, isDegraded: false, error: fallback.error.message }
  }

  return { tenant: (fallback.data as T | null) ?? null, isDegraded: true, error: null }
}
