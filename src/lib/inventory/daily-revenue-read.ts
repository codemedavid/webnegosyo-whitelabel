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
 * BRANCH: the Supabase paths narrow by `outlet_id`. The Convex path narrows too
 * from schema v18, and NOT before — an older deployment rejects the unknown
 * argument outright. `resolveReportScope` owns that decision from the tenant's
 * recorded version; this module simply forwards what it is given.
 *
 * WHICH FIGURE: on Supabase backends, NET SALES by the one sales model
 * (`src/lib/reports/sales-model.ts`): what the food sold for after its
 * discounts, without service charges or delivery fees. Food cost % divides by
 * it, and fees are income the food did not earn — dividing by the order total
 * made a delivery-heavy store's food cost look better than it was. The sales
 * reports quote the same figure, so the two screens agree.
 *
 * A Convex store still reports its order totals (fees included): its
 * deployments answer only `totalRevenue`. Net sales for Convex arrive with the
 * Convex readers (plan Phase 7); `revenueBasisFor` tells the screen which one
 * it is showing.
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
import { readPagesConcurrently } from '@/lib/dashboard/paged-read'
import { fromCents } from '@/lib/reports/money'
import { orderFigures } from '@/lib/reports/sales-model'
import {
  REPORT_ORDER_COLUMNS,
  toReportOrder,
  type PlatformOrderRow,
} from '@/lib/reports/read/platform-order-row'
import { inclusiveEndFor } from '@/lib/convex/period-bounds'
import { REVERSED_STATUSES } from '@/lib/customer-order-facts'

/** How long a Convex deployment gets before the report gives up on it. */
const DEFAULT_TIMEOUT_MS = 6000

const CONVEX_STATS_PATH = 'orders:getDashboardStatsByPeriodInternal'

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

/** The sales model's reversed statuses, as a PostgREST `in` list. */
const REVERSED_STATUS_FILTER = `(${[...REVERSED_STATUSES].join(',')})`

/** PostgREST's row cap: every read past it is paged. */
const PAGE_SIZE = 1000
/** Far past any one day's orders; a day this large is refused, never summed short. */
const MAX_DAY_ROWS = 50_000
const PAGE_CONCURRENCY = 4

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

export type RevenueBasis = 'net_sales' | 'order_totals'

/** Which figure `getDailyRevenue` returns for this tenant. */
export function revenueBasisFor(tenant: OrderBackendTenantFields): RevenueBasis {
  return resolveOrderBackend(tenant) === 'convex' ? 'order_totals' : 'net_sales'
}

/**
 * Sum a day's net sales over live (not reversed) orders out of a Supabase
 * `orders` table.
 *
 * Shared by the platform and per-tenant projects because the schema is the same
 * in both — the only difference is which client reaches it.
 *
 * Offset paging: an order cancelled while a 1,000+ order day is being read can
 * shift one row across a page boundary. Accepted for this one card; the report
 * RPCs (Phase 1) aggregate in SQL and have no pages.
 */
async function sumNetSales(
  client: SupabaseClient,
  tenantId: string,
  startIso: string,
  endIso: string,
  outletId?: string | null,
): Promise<number> {
  const result = await readPagesConcurrently<PlatformOrderRow>(
    (from, to) => {
      const query = client
        .from('orders')
        .select(REPORT_ORDER_COLUMNS)
        .eq('tenant_id', tenantId)
        .not('status', 'in', REVERSED_STATUS_FILTER)
        .gte('created_at', startIso)
        .lt('created_at', endIso)

      // Narrowed only when a branch was named. The owner's report is the default
      // and must not acquire a filter by accident: silently narrowed, they would
      // see a fraction of their own takings with nothing on screen to say so.
      // Paged in a total order (`id` breaks created_at ties), so no row lands on
      // two pages or none.
      return (outletId ? query.eq('outlet_id', outletId) : query)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    },
    { pageSize: PAGE_SIZE, maxRows: MAX_DAY_ROWS, concurrency: PAGE_CONCURRENCY },
  )

  if (result.error) {
    throw new Error(`Failed to read the day's orders: ${result.error}`)
  }
  if (result.truncated) {
    throw new Error(`The day has more than ${MAX_DAY_ROWS} orders; refusing to report a partial sum`)
  }

  // Summed in centavos: thousands of float pesos drift off the real total.
  // No lines or payments are read: net sales comes from the order's own
  // total, fees and discount, and lines only split it further.
  const netCents = result.rows.reduce((sum, row) => {
    const figures = orderFigures(toReportOrder(row, [], []))
    return figures.isLive ? sum + figures.netCents : sum
  }, 0)
  return fromCents(netCents)
}

async function readConvexRevenue(
  tenant: DailyRevenueTenant,
  startIso: string,
  endIso: string,
  deps: DailyRevenueDeps,
  outletId?: string | null,
): Promise<number> {
  const factory = deps.convexClient ?? createConvexServerClient
  const client = factory(tenant.convex_deployment_url ?? '', tenant.convex_deploy_key ?? '')

  // `getDashboardStatsByPeriod` takes arbitrary epoch bounds and already
  // excludes cancelled orders, so the Manila window maps onto it directly and
  // no new Convex function has to be deployed to every tenant.
  // The branch key is omitted entirely rather than sent as `undefined`: a
  // Convex validator still sees the key, and a deployment below v18 rejects
  // one it does not know. Callers that ask store-wide must keep asking exactly
  // what they ask today. Whether it is SAFE to send at all is
  // `resolveReportScope`'s decision, from the tenant's recorded version.
  // The query's window is INCLUSIVE at both ends, so the exclusive end is
  // passed as the last instant before it: an order at exactly midnight belongs
  // to the next day only, as it does in the Supabase read.
  const stats = await withTimeout(
    client.query<{ totalRevenue?: number }>(CONVEX_STATS_PATH, {
      startDate: Date.parse(startIso),
      endDate: inclusiveEndFor(Date.parse(endIso)),
      ...(outletId ? { outletId } : {}),
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
  outletId?: string | null,
): Promise<number | null> {
  const { startIso, endIso } = resolveBusinessDayWindow(dayKey)
  const backend = resolveOrderBackend(tenant)

  try {
    if (backend === 'convex') {
      return await readConvexRevenue(tenant, startIso, endIso, deps, outletId)
    }

    const client =
      backend === 'supabase'
        ? (deps.tenantClient ?? createTenantOrderWriteClient)(tenant)
        : await (deps.platformClient ?? createClient)()

    return await sumNetSales(client, tenant.id, startIso, endIso, outletId)
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
