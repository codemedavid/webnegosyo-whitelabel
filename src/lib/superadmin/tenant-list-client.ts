import type { Tenant } from '@/types/database'
import type { TenantMetrics } from '@/lib/queries/tenant-metrics-server'
import type {
  TenantFeatureFilter,
  TenantSort,
  TenantStatusFilter,
} from '@/lib/superadmin/tenant-search'

/** Browser-side readers for the superadmin restaurant list route handlers. */

export interface TenantListParams {
  search: string
  page: number
  status: TenantStatusFilter
  feature: TenantFeatureFilter
  sort: TenantSort
}

export interface TenantPage {
  tenants: Tenant[]
  count: number
}

interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
}

export function buildTenantListUrl(params: TenantListParams): string {
  const query = new URLSearchParams()
  if (params.search) query.set('q', params.search)
  if (params.page > 1) query.set('page', String(params.page))
  if (params.status !== 'all') query.set('status', params.status)
  if (params.feature !== 'all') query.set('feature', params.feature)
  if (params.sort !== 'recent') query.set('sort', params.sort)
  const qs = query.toString()
  return qs ? `/api/superadmin/tenants?${qs}` : '/api/superadmin/tenants'
}

async function readEnvelope<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok || !body?.success || body.data === null) {
    throw new Error(body?.error || fallback)
  }
  return body.data
}

export async function fetchTenantPage(
  params: TenantListParams,
  signal?: AbortSignal,
): Promise<TenantPage> {
  const response = await fetch(buildTenantListUrl(params), { signal })
  return readEnvelope<TenantPage>(response, 'Could not load restaurants')
}

export async function fetchTenantMetricsFor(
  ids: string[],
  signal?: AbortSignal,
): Promise<Record<string, TenantMetrics>> {
  const query = new URLSearchParams({ ids: ids.join(',') })
  const response = await fetch(`/api/superadmin/tenants/metrics?${query}`, { signal })
  return readEnvelope<Record<string, TenantMetrics>>(response, 'Could not load order metrics')
}
