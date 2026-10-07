/**
 * Everything the web admin dashboard renders, read from wherever the store's
 * orders actually live (`resolveOrderBackend`, the function checkout writes
 * with) and computed by the pure Overview / Growth modules.
 *
 * Callers MUST verify the viewer's permission first: this runs with the service
 * role so its result can be cached briefly per store, range and branch.
 */

import 'server-only'

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import { getTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'
import {
  hasTenantSupabaseOrderCredentials,
  resolveOrderBackend,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'
import { buildVisitIndex } from '@/lib/growth/classify-sale'
import { buildGrowth, type DashboardGrowth } from '@/lib/growth/growth-metrics'
import { buildCustomerSummary, type CustomerSummary } from '@/lib/growth/customer-summary'
import { buildOverview, type DashboardOverview } from './overview'
import {
  DAY_MS,
  compareLabelFor,
  manilaDayStart,
  resolveDashboardWindow,
  type DashboardRange,
} from './periods'
import { isCompletedSale } from './sale-record'
import { readConvexSales } from './read-convex-sales'
import { readSupabaseSales } from './read-supabase-sales'
import { readCustomerSignals, type LoyaltyActions, type ReachableAudience } from './read-customer-signals'
import type { SalesReadResult, SalesReadWindow } from './sales-read'

/** Seconds a computed dashboard is reused; the live-orders strip is never cached. */
const DASHBOARD_REVALIDATE_SECONDS = 120
/** History the Growth tab always needs: a 30-day path and 4 same-weekday baselines. */
const GROWTH_LOOKBACK_DAYS = 31

type DashboardTenant = OrderBackendTenantFields & { id: string }

/** Tenant columns that decide where the orders are and how to reach them. */
const TENANT_ROUTING_SELECT =
  'id, order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key, supabase_order_service_key'

export interface LoadAdminDashboardParams {
  range: DashboardRange
  /** Branch-scoped viewers see one branch; null is the whole business. */
  outletId: string | null
  includeOverview: boolean
  includeGrowth: boolean
}

export interface DashboardGrowthView extends DashboardGrowth {
  /** New and returning customers counted as people, with what each group spent. */
  customers: CustomerSummary
  /** A one-branch view: store-wide audience, cards and stamp-card setup are withheld. */
  isBranchView: boolean
  reachable: ReachableAudience | null
  loyalty: LoyaltyActions | null
  hasLoyaltyProgram: boolean
}

export interface AdminDashboardData {
  range: DashboardRange
  compareLabel: string
  generatedAt: number
  overview: DashboardOverview | null
  growth: DashboardGrowthView | null
  notes: string[]
  /** The order read failed outright — render an error, never zeros. */
  failed: boolean
}

function unreadable(note: string): SalesReadResult {
  return { sales: [], priorVisits: [], notes: [note], failed: true }
}

/** One store's sales over a window, read from the backend its orders actually live in. */
export async function readTenantSales(tenantId: string, window: SalesReadWindow): Promise<SalesReadResult> {
  const admin = createAdminClient()
  const [routing, secrets] = await Promise.all([
    admin.from('tenants').select(TENANT_ROUTING_SELECT).eq('id', tenantId).single(),
    getTenantSecrets(admin, tenantId),
  ])
  if (routing.error || !routing.data) return unreadable('This store could not be loaded.')

  const full = mergeTenantSecrets(routing.data as unknown as DashboardTenant, secrets)
  const backend = resolveOrderBackend(full)

  if (backend === 'convex') {
    const url = full.convex_deployment_url?.trim()
    const key = full.convex_deploy_key?.trim()
    if (!url || !key) {
      return unreadable('This store is on Convex but its credentials are missing.')
    }
    return readConvexSales({ url, key }, window)
  }
  if (backend === 'supabase') {
    if (!hasTenantSupabaseOrderCredentials(full)) {
      return unreadable("This store's own order database is not configured.")
    }
    return readSupabaseSales(createTenantOrderWriteClient(full), tenantId, window)
  }
  return readSupabaseSales(admin, tenantId, window)
}

async function computeDashboard(
  tenantId: string,
  params: LoadAdminDashboardParams,
): Promise<AdminDashboardData> {
  const now = Date.now()
  const window = resolveDashboardWindow(params.range, now)
  const readStart = params.includeGrowth
    ? Math.min(window.previousStart, manilaDayStart(now) - GROWTH_LOOKBACK_DAYS * DAY_MS)
    : window.previousStart

  // The customer signals do not depend on the order read: issue both at once.
  const [read, signals] = await Promise.all([
    readTenantSales(tenantId, {
      readStart,
      currentStart: window.start,
      now,
      outletId: params.outletId,
      includeItems: params.includeOverview,
      includePriorVisits: params.includeGrowth,
    }),
    params.includeGrowth ? readCustomerSignals(createAdminClient(), tenantId, now) : null,
  ])
  const base = { range: params.range, compareLabel: compareLabelFor(params.range), generatedAt: now }
  if (read.failed) return { ...base, overview: null, growth: null, notes: read.notes, failed: true }

  const notes = [...read.notes]
  let growth: DashboardGrowthView | null = null
  if (signals) {
    notes.push(...signals.notes)
    const windowVisits = read.sales.flatMap((sale) =>
      sale.phone && isCompletedSale(sale) ? [{ phone: sale.phone, at: sale.at }] : [],
    )
    // Store-wide audience and card counts are withheld from a one-branch view.
    const isBranchView = params.outletId !== null
    const growthInput = {
      sales: read.sales,
      visits: buildVisitIndex([...read.priorVisits, ...windowVisits]),
      cardsSince: signals.cardsSince,
      window,
    }
    growth = {
      ...buildGrowth(growthInput),
      customers: buildCustomerSummary(growthInput),
      isBranchView,
      reachable: isBranchView ? null : signals.reachable,
      loyalty: isBranchView ? null : signals.loyalty,
      hasLoyaltyProgram: signals.loyalty !== null,
    }
  }

  return {
    ...base,
    overview: params.includeOverview ? buildOverview(read.sales, window) : null,
    growth,
    notes,
    failed: false,
  }
}

export async function loadAdminDashboard(
  tenantId: string,
  params: LoadAdminDashboardParams,
): Promise<AdminDashboardData> {
  const cached = unstable_cache(
    () => computeDashboard(tenantId, params),
    [
      'admin-dashboard-v4',
      tenantId,
      params.range,
      params.outletId ?? 'all',
      String(params.includeOverview),
      String(params.includeGrowth),
    ],
    { revalidate: DASHBOARD_REVALIDATE_SECONDS, tags: [`admin-dashboard:${tenantId}`] },
  )
  return cached()
}
