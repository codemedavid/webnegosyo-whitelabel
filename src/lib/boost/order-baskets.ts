/**
 * Order baskets from wherever a store's orders actually live, summarised into
 * "what is ordered together".
 *
 * Orders sit in one of three backends (`resolveOrderBackend`): the shared
 * platform database, the store's own Supabase project, or its own Convex
 * deployment. Each is read from its real home and labelled; an unreachable
 * backend returns an EMPTY summary with a note, never a fallback to another
 * database — that would answer from the wrong project.
 *
 * The summary (not the raw baskets) is cached in Redis for a few minutes: it
 * is small, and both the Boost Sales page and the analytics page read it.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTenantOrderWriteClient, type TenantOrderCredentials } from '@/lib/supabase/tenant-order-client'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { generateCacheKey, getCachedOrFetch } from '@/lib/redis-cache'
import { buildBasketStats } from './basket-stats'
import { findPickedTogether, type PickedTogetherPair } from './pair-insights'

export type BasketSource = 'platform' | 'tenant_supabase' | 'convex'

export interface BasketSummary {
  dataSource: BasketSource
  /** False when the backend could not be read; `note` says why. */
  isAvailable: boolean
  note: string | null
  /** e.g. "last 90 days" or "latest 10,000 order lines". */
  windowLabel: string
  orderCount: number
  /** Orders containing each menu item. */
  itemOrders: Record<string, number>
  /** Strongest pairs first, above chance only. */
  pairs: PickedTogetherPair[]
}

export const BASKET_HISTORY_DAYS = 90
/** Enough baskets to see patterns without pulling a large store's whole history. */
export const MAX_BASKET_ORDERS = 4000
/** The platform API's per-request row cap. */
const PAGE_SIZE = 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SUMMARY_PAIRS = 60
const SUMMARY_TTL_SECONDS = 600
const CONVEX_ORDER_ITEMS_PATH = 'orders:getAllOrderItemsInternal'
/** What the Convex order-items query returns at most (convex-template QUERY_LIMIT). */
const CONVEX_LINE_LIMIT = 10_000

const TENANT_ROUTING_SELECT =
  'id, order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key, supabase_order_service_key'

type BasketTenant = OrderBackendTenantFields & TenantOrderCredentials & { id: string }

/**
 * Recent non-cancelled orders with their lines, paged: the API returns at most
 * 1000 rows per request whatever `limit` asks for, so one read would quietly
 * stop at 1000 orders. Ordered down to a unique column so pages never overlap.
 */
export async function readRecentOrderRows<Row>(
  client: SupabaseClient,
  tenantId: string,
  select: string,
  { days = BASKET_HISTORY_DAYS, maxOrders = MAX_BASKET_ORDERS }: { days?: number; maxOrders?: number } = {}
): Promise<Row[] | null> {
  const since = new Date(Date.now() - days * DAY_MS).toISOString()
  const rows: Row[] = []

  while (rows.length < maxOrders) {
    const from = rows.length
    const { data, error } = await client
      .from('orders')
      .select(select)
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, Math.min(from + PAGE_SIZE, maxOrders) - 1)

    if (error) {
      console.error('[boost] order history read failed:', error.message)
      return rows.length > 0 ? rows : null
    }
    const page = (data ?? []) as unknown as Row[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

interface BasketOrderRow {
  order_items: { menu_item_id: string | null }[] | null
}

/** A platform order with the lines Boost Sales learns from and reports on. */
export interface PlatformHistoryRow {
  id: string
  created_at: string
  order_items: {
    menu_item_id: string | null
    is_upsell_item: boolean | null
    bundle_id: string | null
    subtotal: number | null
  }[] | null
}

const PLATFORM_HISTORY_SELECT = 'id, created_at, order_items(menu_item_id, is_upsell_item, bundle_id, subtotal)'

/**
 * The platform store's recent orders, read ONCE per request. Boost Sales used
 * to read the same 90-day / 4000-order history twice per render — once for
 * the workspace (ideas + performance) and again, with a narrower projection,
 * for the "Picked together" summary streamed beside it. Both now share this
 * read (the projection covers both); outside a render `cache` is a pass-through.
 */
export const readPlatformOrderHistory = cache((tenantId: string) =>
  readRecentOrderRows<PlatformHistoryRow>(createAdminClient() as unknown as SupabaseClient, tenantId, PLATFORM_HISTORY_SELECT)
)

interface ConvexOrderLine {
  orderId?: unknown
  menuItemId?: unknown
}

export function summarizeBaskets(
  baskets: readonly (readonly string[])[],
  meta: { dataSource: BasketSource; windowLabel: string }
): BasketSummary {
  const stats = buildBasketStats(baskets)
  return {
    dataSource: meta.dataSource,
    isAvailable: true,
    note: null,
    windowLabel: meta.windowLabel,
    orderCount: stats.orderCount,
    itemOrders: Object.fromEntries(stats.itemOrders),
    pairs: findPickedTogether(stats, { limit: MAX_SUMMARY_PAIRS }),
  }
}

/** Group Convex order lines into one basket per order. */
export function convexLinesToBaskets(lines: readonly ConvexOrderLine[]): string[][] {
  const byOrder = new Map<string, string[]>()
  for (const line of lines) {
    if (typeof line.orderId !== 'string' || typeof line.menuItemId !== 'string' || !line.menuItemId) continue
    byOrder.set(line.orderId, [...(byOrder.get(line.orderId) ?? []), line.menuItemId])
  }
  return [...byOrder.values()]
}

function unavailable(dataSource: BasketSource, note: string): BasketSummary {
  return { dataSource, isAvailable: false, note, windowLabel: '', orderCount: 0, itemOrders: {}, pairs: [] }
}

function summarizeOrderRows(rows: readonly BasketOrderRow[] | null, dataSource: BasketSource): BasketSummary {
  if (!rows) return unavailable(dataSource, 'Your order history could not be read right now.')
  const baskets = rows.map((row) =>
    (row.order_items ?? []).map((line) => line.menu_item_id).filter((id): id is string => !!id)
  )
  return summarizeBaskets(baskets, { dataSource, windowLabel: `last ${BASKET_HISTORY_DAYS} days` })
}

async function readSupabaseSummary(client: SupabaseClient, tenantId: string, dataSource: BasketSource): Promise<BasketSummary> {
  return summarizeOrderRows(await readRecentOrderRows<BasketOrderRow>(client, tenantId, 'id, order_items(menu_item_id)'), dataSource)
}

async function readConvexSummary(tenant: BasketTenant & { convex_deploy_key?: string | null }): Promise<BasketSummary> {
  const url = tenant.convex_deployment_url?.trim()
  const key = tenant.convex_deploy_key?.trim()
  if (!url || !key) return unavailable('convex', 'Your order backend is not fully connected, so order history cannot be read.')
  try {
    const lines = await createConvexServerClient(url, key).query<unknown>(CONVEX_ORDER_ITEMS_PATH, {})
    const baskets = convexLinesToBaskets(Array.isArray(lines) ? (lines as ConvexOrderLine[]) : [])
    return summarizeBaskets(baskets, {
      dataSource: 'convex',
      windowLabel: `latest ${CONVEX_LINE_LIMIT.toLocaleString('en-PH')} order lines`,
    })
  } catch (error) {
    console.error('[boost] convex basket read failed:', error)
    return unavailable('convex', 'Your order history could not be read right now.')
  }
}

/** A fresh, uncached read — for an AI run, which must not act on a stale failure. */
export async function readBasketSummary(tenantId: string): Promise<BasketSummary> {
  const admin = createAdminClient() as unknown as SupabaseClient
  // Routing row and secrets are independent: read them together.
  const [{ data, error }, secrets] = await Promise.all([
    admin.from('tenants').select(TENANT_ROUTING_SELECT).eq('id', tenantId).single(),
    getTenantSecrets(admin, tenantId),
  ])
  if (error || !data) throw new Error(`Store ${tenantId} could not be loaded: ${error?.message ?? 'not found'}`)

  const tenant = mergeTenantSecrets(data as unknown as BasketTenant, secrets)
  const backend = resolveOrderBackend(tenant)

  if (backend === 'convex') return readConvexSummary(tenant)
  if (backend === 'supabase') {
    try {
      return await readSupabaseSummary(createTenantOrderWriteClient(tenant), tenantId, 'tenant_supabase')
    } catch (err) {
      console.error('[boost] tenant supabase basket read failed:', err)
      return unavailable('tenant_supabase', 'Your order backend is not fully connected, so order history cannot be read.')
    }
  }
  return summarizeOrderRows(await readPlatformOrderHistory(tenantId), 'platform')
}

/** What this store's customers order together, from its real order backend. */
export async function getBasketSummary(tenantId: string): Promise<BasketSummary> {
  return getCachedOrFetch(generateCacheKey('boost-baskets', tenantId), () => readBasketSummary(tenantId), SUMMARY_TTL_SECONDS)
}
