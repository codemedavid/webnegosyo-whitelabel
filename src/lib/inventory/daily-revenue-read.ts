/**
 * What one Manila day took, wherever the tenant's orders actually live.
 *
 * The stock ledger is always platform-side, but orders are NOT: depending on the
 * tenant they sit in the shared platform project, in the tenant's own Supabase
 * project, or in the tenant's own Convex deployment. Reading revenue straight
 * from the platform `orders` table would therefore hand every Convex tenant a
 * zero — and a zero denominator does not produce an obvious error, it produces a
 * flattering food cost percentage. So this module routes through the same
 * `resolveOrderBackend` seam that checkout writes through, which is what stops
 * the report reading one database while the merchant's queue watches another.
 *
 * EVERY failure path returns `null`, never `0`. `null` means "not known" and the
 * report renders a reason; `0` means "genuinely took nothing" and the report
 * says so. Collapsing the two is the one bug this module exists to prevent.
 *
 * WHICH FIGURE: the order `total`, matching the dashboard, the merchant app's
 * daily stats, and the superadmin analytics. `total` includes delivery fees,
 * which are income the food cost did not produce, so the percentage runs
 * slightly optimistic for a delivery-heavy tenant. That is a real distortion and
 * it is accepted deliberately: the alternative is an inventory screen quoting a
 * different "revenue today" than every other screen in the product, and a
 * merchant reconciling two disagreeing figures trusts neither.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  createTenantOrderWriteClient,
  type TenantOrderCredentials,
} from '@/lib/supabase/tenant-order-client'
import { createConvexServerClient } from '@/lib/convex/server'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { resolveBusinessDayWindow } from '@/lib/inventory/business-day'

/** How long a Convex deployment gets before the report gives up on it. */
const DEFAULT_TIMEOUT_MS = 6000

const CONVEX_STATS_PATH = 'orders:getDashboardStatsByPeriod'

export interface DailyRevenueTenant extends OrderBackendTenantFields, TenantOrderCredentials {
  id: string
}

interface ConvexQueryClient {
  query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>
}

/**
 * Injected so tests never open a connection, mirroring the factory-injection
 * `tenant-order-client.ts` and `convex-platform-aggregator.ts` already use.
 */
export interface DailyRevenueDeps {
  platformClient?: () => Promise<SupabaseClient>
  tenantClient?: (credentials: TenantOrderCredentials) => SupabaseClient
  convexClient?: (url: string, key: string) => ConvexQueryClient
  timeoutMs?: number
}

interface OrderTotalRow {
  total: number | null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Order backend timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Sum a day's non-cancelled order totals out of a Supabase `orders` table.
 *
 * Shared by the platform and per-tenant projects because the schema is the same
 * in both — the only difference is which client reaches it.
 */
async function sumOrderTotals(
  client: SupabaseClient,
  tenantId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { data, error } = await client
    .from('orders')
    .select('total')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .gte('created_at', startIso)
    .lt('created_at', endIso)

  if (error) {
    throw new Error(`Failed to read the day's orders: ${error.message}`)
  }

  return ((data ?? []) as unknown as OrderTotalRow[]).reduce(
    (sum, row) => sum + (row.total ?? 0),
    0,
  )
}

async function readConvexRevenue(
  tenant: DailyRevenueTenant,
  startIso: string,
  endIso: string,
  deps: DailyRevenueDeps,
): Promise<number> {
  const factory = deps.convexClient ?? createConvexServerClient
  const client = factory(tenant.convex_deployment_url ?? '', tenant.convex_deploy_key ?? '')

  // `getDashboardStatsByPeriod` takes arbitrary epoch bounds and already
  // excludes cancelled orders, so the Manila window maps onto it directly and
  // no new Convex function has to be deployed to every tenant.
  const stats = await withTimeout(
    client.query<{ totalRevenue?: number }>(CONVEX_STATS_PATH, {
      startDate: Date.parse(startIso),
      endDate: Date.parse(endIso),
    }),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )

  // An older deployment that answers without this field has not told us the
  // revenue, and guessing zero for it is the exact mistake this module avoids.
  if (typeof stats?.totalRevenue !== 'number') {
    throw new Error('Convex returned no revenue figure for the window')
  }

  return stats.totalRevenue
}

/**
 * The day's takings, or `null` when they could not be established.
 *
 * Never throws: revenue is one card on a read-only report, and a tenant with an
 * unreachable order backend should still get their stock figures.
 */
export async function getDailyRevenue(
  tenant: DailyRevenueTenant,
  dayKey: string,
  deps: DailyRevenueDeps = {},
): Promise<number | null> {
  const { startIso, endIso } = resolveBusinessDayWindow(dayKey)
  const backend = resolveOrderBackend(tenant)

  try {
    if (backend === 'convex') {
      return await readConvexRevenue(tenant, startIso, endIso, deps)
    }

    const client =
      backend === 'supabase'
        ? (deps.tenantClient ?? createTenantOrderWriteClient)(tenant)
        : await (deps.platformClient ?? createClient)()

    return await sumOrderTotals(client, tenant.id, startIso, endIso)
  } catch (error) {
    console.error('[inventory] daily revenue read failed', {
      tenantId: tenant.id,
      dayKey,
      backend,
      error,
    })
    return null
  }
}
