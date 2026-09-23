import { z } from 'zod'

/**
 * Superadmin restaurant search — input parsing and the PostgREST filter.
 *
 * Pure (no Supabase, no Next) so the route handlers and the server page share
 * one definition and it can be tested without a database.
 */

export const TENANT_SEARCH_MAX_LENGTH = 100
export const TENANT_METRICS_MAX_IDS = 50

export const TENANT_SORTS = ['recent', 'oldest', 'name', 'status'] as const
export const TENANT_STATUS_FILTERS = ['all', 'active', 'inactive'] as const
export const TENANT_FEATURE_FILTERS = [
  'all',
  'menu_engineering',
  'bundles',
  'app',
  'lalamove',
] as const

export type TenantSort = (typeof TENANT_SORTS)[number]
export type TenantStatusFilter = (typeof TENANT_STATUS_FILTERS)[number]
export type TenantFeatureFilter = (typeof TENANT_FEATURE_FILTERS)[number]

/** Columns a search term is matched against. */
const SEARCH_COLUMNS = ['name', 'slug', 'domain'] as const

/** Trim, collapse runs of whitespace, and cap the length. */
export function normalizeTenantSearch(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().replace(/\s+/g, ' ').slice(0, TENANT_SEARCH_MAX_LENGTH)
}

/** Escape LIKE wildcards (and the escape char itself) so they match literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** Escape a value for a double-quoted PostgREST filter value. */
function quotePostgrest(value: string): string {
  return `"${value.replace(/[\\"]/g, (ch) => `\\${ch}`)}"`
}

/**
 * A PostgREST `or=` filter matching the term anywhere in name, slug or domain.
 *
 * Values are double-quoted so commas, dots and parentheses in a restaurant
 * name cannot split or rewrite the filter, and LIKE wildcards are escaped so
 * "50%" searches for the text "50%".
 */
export function buildTenantSearchFilter(term: string): string {
  const pattern = quotePostgrest(`%${escapeLike(term)}%`)
  return SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(',')
}

const tenantListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .transform((value) => normalizeTenantSearch(value)),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  status: z.enum(TENANT_STATUS_FILTERS).default('all'),
  feature: z.enum(TENANT_FEATURE_FILTERS).default('all'),
  sort: z.enum(TENANT_SORTS).default('recent'),
})

export type TenantListQuery = z.infer<typeof tenantListQuerySchema>

type ParseResult<T> = { success: true; data: T } | { success: false; error: string }

/** Parse the list endpoint's query string (`q`, `page`, `status`, `feature`, `sort`). */
export function parseTenantListQuery(params: URLSearchParams): ParseResult<TenantListQuery> {
  const parsed = tenantListQuerySchema.safeParse({
    search: params.get('q') ?? undefined,
    page: params.get('page') ?? undefined,
    status: params.get('status') ?? undefined,
    feature: params.get('feature') ?? undefined,
    sort: params.get('sort') ?? undefined,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid query' }
  }
  return { success: true, data: parsed.data }
}

const metricsIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(TENANT_METRICS_MAX_IDS)

/** Parse the metrics endpoint's comma-separated `ids`, de-duplicated. */
export function parseTenantMetricsIds(raw: string | null): ParseResult<string[]> {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const parsed = metricsIdsSchema.safeParse(ids)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid ids' }
  }
  return { success: true, data: Array.from(new Set(parsed.data)) }
}
