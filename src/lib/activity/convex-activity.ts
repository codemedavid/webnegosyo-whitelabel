/**
 * Order activity from each Convex-backed store's own deployment.
 *
 * Every Convex store runs its own deployment, so this is an N-call fan-out,
 * bounded by the same concurrency cap and per-store timeout the platform
 * analytics use. A store that errors or times out comes back `unreachable` —
 * never as zero orders (see `tenant-activity.ts`).
 */

import { createConvexServerClient } from '@/lib/convex/server'
import {
  mapWithConcurrency,
  withTimeout,
  type ConvexClientFactory,
  type ConvexTenantTarget,
} from '@/lib/queries/convex-platform-aggregator'
import {
  convexToStats,
  type ConvexActivityEntry,
  type ConvexPeriodStatsLike,
} from '@/lib/activity/tenant-activity'

const PATH_PERIOD = 'orders:getDashboardStatsByPeriodInternal'
const PATH_ORDERS = 'orders:getOrdersInternal'

const DEFAULT_CONCURRENCY = 8
const DEFAULT_TIMEOUT_MS = 6000

export interface ConvexActivityWindow {
  startMs: number
  /** Exclusive. */
  endMs: number
}

export interface FetchConvexActivityOptions {
  factory?: ConvexClientFactory
  concurrency?: number
  timeoutMs?: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchOne(
  target: ConvexTenantTarget,
  window: ConvexActivityWindow,
  factory: ConvexClientFactory,
  timeoutMs: number
): Promise<ConvexActivityEntry> {
  try {
    const client = factory(target.url, target.key)
    const [period, latest] = await withTimeout(
      Promise.all([
        // The period query's upper bound is inclusive (`lte`), so step back one
        // millisecond to keep the window half-open like the platform side.
        client.query<ConvexPeriodStatsLike>(PATH_PERIOD, {
          startDate: window.startMs,
          endDate: window.endMs - 1,
        }),
        // Newest first; one row is the store's last sign of life.
        client.query<{ _creationTime?: number }[]>(PATH_ORDERS, { limit: 1 }),
      ]),
      timeoutMs
    )

    return { source: 'ok', stats: convexToStats(period, latest?.[0] ?? null) }
  } catch (error) {
    const message = errorMessage(error)
    console.error(`[tenant-activity] convex store ${target.tenantId} unreachable:`, message)
    return { source: 'unreachable', stats: null, error: message }
  }
}

export async function fetchConvexActivity(
  targets: readonly ConvexTenantTarget[],
  window: ConvexActivityWindow,
  options: FetchConvexActivityOptions = {}
): Promise<Map<string, ConvexActivityEntry>> {
  const factory: ConvexClientFactory =
    options.factory ?? ((url, key) => createConvexServerClient(url, key))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const entries = await mapWithConcurrency(
    [...targets],
    options.concurrency ?? DEFAULT_CONCURRENCY,
    async (target) => [target.tenantId, await fetchOne(target, window, factory, timeoutMs)] as const
  )

  return new Map(entries)
}
