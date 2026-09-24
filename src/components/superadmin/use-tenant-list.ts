'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { Tenant } from '@/types/database'
import type { TenantMetrics } from '@/lib/queries/tenant-metrics-server'
import {
  normalizeTenantSearch,
  type TenantFeatureFilter,
  type TenantSort,
  type TenantStatusFilter,
} from '@/lib/superadmin/tenant-search'
import {
  fetchTenantMetricsFor,
  fetchTenantPage,
  type TenantListParams,
  type TenantPage,
} from '@/lib/superadmin/tenant-list-client'

export const TENANT_SEARCH_DEBOUNCE_MS = 300
const LIST_STALE_MS = 30_000
const METRICS_STALE_MS = 5 * 60_000

export const superadminTenantKeys = {
  all: ['superadmin-tenants'] as const,
  lists: () => [...superadminTenantKeys.all, 'list'] as const,
  list: (params: TenantListParams) => [...superadminTenantKeys.lists(), params] as const,
  metricsFor: (ids: string[]) => [...superadminTenantKeys.all, 'metrics', ids] as const,
  metric: (id: string) => [...superadminTenantKeys.all, 'metric', id] as const,
}

/**
 * Metrics for a page of rows, fetching only tenants with no cached entry.
 *
 * Metrics are a Convex fan-out per tenant, so a search that re-surfaces rows
 * already seen must not pay for them again. Each tenant's numbers are cached
 * under their own key; the page query stitches them together.
 */
async function loadMetrics(
  queryClient: QueryClient,
  ids: string[],
  signal: AbortSignal,
): Promise<Record<string, TenantMetrics>> {
  const known: Record<string, TenantMetrics> = {}
  const missing: string[] = []
  for (const id of ids) {
    const hit = queryClient.getQueryData<TenantMetrics>(superadminTenantKeys.metric(id))
    if (hit) known[id] = hit
    else missing.push(id)
  }
  if (!missing.length) return known

  const fresh = await fetchTenantMetricsFor(missing, signal)
  for (const [id, metrics] of Object.entries(fresh)) {
    queryClient.setQueryData(superadminTenantKeys.metric(id), metrics)
  }
  return { ...known, ...fresh }
}

interface UseTenantListOptions {
  initialTenants: Tenant[]
  initialCount: number
  initialSearch: string
}

const DEFAULT_QUERY: Omit<TenantListParams, 'search'> = {
  page: 1,
  status: 'all',
  feature: 'all',
  sort: 'recent',
}

/**
 * Search, filter, sort and paginate the superadmin restaurant list.
 *
 * - The server renders the first page; it seeds the cache, so mount does not
 *   refetch it.
 * - TanStack Query aborts superseded requests and keys results by query, so a
 *   slow response for "sea" can never overwrite "seacook", and going back to
 *   an earlier search or page is instant.
 * - Rows render as soon as the list arrives; metrics fill in afterwards.
 * - The search is mirrored into ?q= with history.replaceState, which Next
 *   syncs with useSearchParams WITHOUT a server round-trip. router.replace
 *   re-rendered the whole force-dynamic page — platform overview and its
 *   Convex fan-out included — on every pause in typing.
 */
export function useTenantList({
  initialTenants,
  initialCount,
  initialSearch,
}: UseTenantListOptions) {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState(initialSearch)
  const [query, setQuery] = useState<TenantListParams>(() => ({
    ...DEFAULT_QUERY,
    search: normalizeTenantSearch(initialSearch),
  }))
  const [initialParams] = useState(query)
  const [seededAt] = useState(() => Date.now())

  /* Debounce the typed search; whitespace-only edits keep the page. */
  useEffect(() => {
    const term = normalizeTenantSearch(search)
    const timer = setTimeout(() => {
      setQuery((prev) => (prev.search === term ? prev : { ...prev, search: term, page: 1 }))
    }, TENANT_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  /* Mirror the debounced search into ?q= without a server render. */
  useEffect(() => {
    const url = new URL(window.location.href)
    if ((url.searchParams.get('q') ?? '') === query.search) return
    if (query.search) url.searchParams.set('q', query.search)
    else url.searchParams.delete('q')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [query.search])

  const isInitialQuery =
    query.search === initialParams.search &&
    query.page === initialParams.page &&
    query.status === initialParams.status &&
    query.feature === initialParams.feature &&
    query.sort === initialParams.sort

  const listQuery = useQuery({
    queryKey: superadminTenantKeys.list(query),
    queryFn: ({ signal }) => fetchTenantPage(query, signal),
    initialData: isInitialQuery ? { tenants: initialTenants, count: initialCount } : undefined,
    initialDataUpdatedAt: seededAt,
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_MS,
  })

  const tenants = listQuery.data?.tenants ?? []
  const ids = tenants.map((tenant) => tenant.id).sort()

  const metricsQuery = useQuery({
    queryKey: superadminTenantKeys.metricsFor(ids),
    queryFn: ({ signal }) => loadMetrics(queryClient, ids, signal),
    enabled: ids.length > 0,
    staleTime: METRICS_STALE_MS,
    retry: false,
  })

  const setStatus = useCallback((status: TenantStatusFilter) => {
    setQuery((prev) => ({ ...prev, status, page: 1 }))
  }, [])
  const setFeature = useCallback((feature: TenantFeatureFilter) => {
    setQuery((prev) => ({ ...prev, feature, page: 1 }))
  }, [])
  const setSort = useCallback((sort: TenantSort) => {
    setQuery((prev) => ({ ...prev, sort, page: 1 }))
  }, [])
  const goToPage = useCallback((page: number) => {
    setQuery((prev) => ({ ...prev, page: Math.max(1, page) }))
  }, [])

  /** Optimistically rewrite the page on screen (delete, bulk activate…). */
  const updateCurrentPage = useCallback(
    (updater: (page: TenantPage) => TenantPage) => {
      queryClient.setQueryData<TenantPage>(superadminTenantKeys.list(query), (prev) =>
        prev ? updater(prev) : prev,
      )
    },
    [queryClient, query],
  )

  /** Mark every cached page stale after a write; the visible one refetches. */
  const invalidateLists = useCallback(
    () => queryClient.invalidateQueries({ queryKey: superadminTenantKeys.lists() }),
    [queryClient],
  )

  return {
    query,
    queryKey: JSON.stringify(query),
    search,
    setSearch,
    setStatus,
    setFeature,
    setSort,
    goToPage,
    tenants,
    count: listQuery.data?.count ?? 0,
    isLoading: listQuery.isFetching && (listQuery.isPlaceholderData || !listQuery.data),
    loadError: listQuery.isError ? listQuery.error.message : null,
    retry: listQuery.refetch,
    metrics: metricsQuery.data ?? {},
    isMetricsLoading: metricsQuery.isFetching,
    hasMetricsError: metricsQuery.isError,
    updateCurrentPage,
    invalidateLists,
  }
}
