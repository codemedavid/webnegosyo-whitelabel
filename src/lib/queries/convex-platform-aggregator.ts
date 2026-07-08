/**
 * Fans out to every Convex-backed tenant deployment and returns a normalized
 * {@link TenantWindowAggregate} per tenant, ready to be merged with the Supabase
 * aggregates by {@link buildPlatformAnalytics}.
 *
 * Each tenant runs its own Convex deployment, so this is inherently an N-call
 * fan-out. We bound it with a concurrency cap + per-tenant timeout, and a tenant
 * that errors or times out degrades to a zero aggregate rather than blanking the
 * whole dashboard.
 */

import { createConvexServerClient } from '@/lib/convex/server'
import {
  convexResponsesToAggregate,
  emptyAggregate,
  type AnalyticsWindows,
  type ConvexPeriodStats,
  type ConvexResponses,
  type ConvexRevenueBreakdown,
  type ConvexTrendBucket,
  type TenantWindowAggregate,
} from '@/lib/queries/platform-analytics-merge'

export interface ConvexTenantTarget {
  tenantId: string
  url: string
  key: string
}

export interface ConvexQueryClient {
  query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>
}

export type ConvexClientFactory = (url: string, key: string) => ConvexQueryClient

export interface FetchConvexAggregatesOptions {
  factory?: ConvexClientFactory
  concurrency?: number
  timeoutMs?: number
  /** whether to also fetch the order-type/payment breakdown (analytics page only) */
  needBreakdown?: boolean
}

const DEFAULT_CONCURRENCY = 8
const DEFAULT_TIMEOUT_MS = 6000
// Large enough to cover the 'all' range while staying within Convex's 10k row cap.
const ALL_RANGE_DAYS = 3650

const PATH_PERIOD = 'orders:getDashboardStatsByPeriod'
const PATH_TRENDS = 'analytics:getTrends'
const PATH_BREAKDOWN = 'analytics:getRevenueBreakdown'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Convex query timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

async function fetchOneTenant(
  target: ConvexTenantTarget,
  windows: AnalyticsWindows,
  client: ConvexQueryClient,
  needBreakdown: boolean,
  timeoutMs: number,
): Promise<TenantWindowAggregate> {
  const daysBack = windows.days ?? ALL_RANGE_DAYS
  const currentArgs = { startDate: windows.startMs ?? 0, endDate: windows.endMs }

  const currentP = client.query<ConvexPeriodStats>(PATH_PERIOD, currentArgs)
  const prevP =
    windows.prevStartMs != null && windows.prevEndMs != null
      ? client.query<ConvexPeriodStats>(PATH_PERIOD, {
          startDate: windows.prevStartMs,
          endDate: windows.prevEndMs,
        })
      : Promise.resolve(null)
  const trendsP = client.query<ConvexTrendBucket[]>(PATH_TRENDS, { daysBack })
  const breakdownP = needBreakdown
    ? client.query<ConvexRevenueBreakdown>(PATH_BREAKDOWN, { daysBack })
    : Promise.resolve(null)

  const [current, prev, trends, breakdown] = await withTimeout(
    Promise.all([currentP, prevP, trendsP, breakdownP]),
    timeoutMs,
  )

  const responses: ConvexResponses = {
    current,
    prev,
    trends: trends ?? [],
    breakdown,
  }
  return convexResponsesToAggregate(target.tenantId, responses)
}

/** Run `worker` over `items` with a bounded number of concurrent executions. */
async function mapWithConcurrency<I, O>(
  items: I[],
  concurrency: number,
  worker: (item: I) => Promise<O>,
): Promise<O[]> {
  const results = new Array<O>(items.length)
  let cursor = 0

  async function runner(): Promise<void> {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner())
  await Promise.all(runners)
  return results
}

export async function fetchConvexAggregates(
  tenants: ConvexTenantTarget[],
  windows: AnalyticsWindows,
  opts: FetchConvexAggregatesOptions = {},
): Promise<TenantWindowAggregate[]> {
  if (!tenants.length) return []

  const factory: ConvexClientFactory =
    opts.factory ?? ((url, key) => createConvexServerClient(url, key))
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const needBreakdown = opts.needBreakdown ?? false

  return mapWithConcurrency(tenants, concurrency, async (target) => {
    try {
      const client = factory(target.url, target.key)
      return await fetchOneTenant(target, windows, client, needBreakdown, timeoutMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[convex-platform-aggregator] tenant ${target.tenantId} failed:`, message)
      return emptyAggregate(target.tenantId)
    }
  })
}
