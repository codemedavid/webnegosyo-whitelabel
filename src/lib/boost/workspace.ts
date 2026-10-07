/**
 * Everything the Boost Sales home needs, in one read.
 *
 * The merchant sees offers by WHERE the diner meets them — on the menu, on the
 * item page, right after adding, in the cart — so this assembles every offer
 * type into one serializable workspace, plus the "Ready to go" ideas.
 *
 * Order history (for smarter ideas and for performance) only exists here for
 * tenants whose orders live in the shared platform database. For the others
 * the ideas fall back to menu logic and performance is `null` — unknown, never
 * a misleading zero.
 */

import { cache } from 'react'
import { getMenuItemsByBcgClassification, getUpsellPairsByTenant } from '@/lib/menu-engineering-service'
import { getBundlesByTenant, type BundleWithSlots } from '@/lib/bundles-service'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { buildBasketStats, type BasketStats } from './basket-stats'
import { buildBoostIdeas, type BoostIdea } from './ideas'
import { classifyMenuRole, type MenuRole } from './menu-roles'
import { groupPairings, type PairingGroup } from './pairing-groups'
import { readPlatformOrderHistory } from './order-baskets'

const PERFORMANCE_DAYS = 30
/** Ideas are computed generously; the client hides dismissed ones and shows a few. */
const IDEA_POOL_SIZE = 12
const DAY_MS = 24 * 60 * 60 * 1000

export interface BoostItem {
  id: string
  name: string
  price: number
  imageUrl: string | null
  categoryId: string | null
  categoryName: string | null
  isAvailable: boolean
  role: MenuRole
}

export interface BoostUpgrade {
  id: string
  sourceId: string
  targetId: string
  isActive: boolean
  header: string | null
  sourceLabel: string | null
  targetLabel: string | null
}

export interface BoostLastCall {
  enabled: boolean
  title: string
  subtitle: string
  maxItems: number
  pickedItemIds: string[]
}

export interface OfferSales {
  orders: number
  revenue: number
}

export interface BoostPerformance {
  days: number
  /**
   * Orders containing each combo. Orders only — a combo's order lines carry
   * just the per-choice surcharges, not its base price, so summing them would
   * report a fraction of what the combo actually earned.
   */
  comboOrders: Record<string, number>
  /** Items added from a suggestion; these lines carry their full price. */
  suggestions: OfferSales
}

export interface BoostWorkspace {
  isEnabled: boolean
  items: BoostItem[]
  combos: BundleWithSlots[]
  upgrades: BoostUpgrade[]
  pairings: PairingGroup[]
  lastCall: BoostLastCall
  ideas: BoostIdea[]
  /** Orders the ideas learned from; null when history is not readable here. */
  historyOrders: number | null
  performance: BoostPerformance | null
}

export interface BoostTenantFields extends OrderBackendTenantFields {
  id: string
  menu_engineering_enabled?: boolean | null
  checkout_upsell_enabled?: boolean | null
  checkout_upsell_title?: string | null
  checkout_upsell_subtitle?: string | null
  checkout_upsell_max_items?: number | null
}

interface OrderHistory {
  stats: BasketStats
  performance: BoostPerformance
}

async function loadOrderHistory(tenantId: string): Promise<OrderHistory | null> {
  // The same request-cached rows the "Picked together" summary reads on this
  // page — one 90-day history read per render, not two.
  const rows = await readPlatformOrderHistory(tenantId)
  if (!rows) return null
  const baskets = rows.map((row) =>
    (row.order_items ?? []).map((line) => line.menu_item_id).filter((id): id is string => !!id)
  )

  const performanceSince = Date.now() - PERFORMANCE_DAYS * DAY_MS
  const comboOrders: Record<string, number> = {}
  let suggestions: OfferSales = { orders: 0, revenue: 0 }

  for (const row of rows) {
    if (new Date(row.created_at).getTime() < performanceSince) continue
    const lines = row.order_items ?? []
    const bundleIds = new Set(lines.map((line) => line.bundle_id).filter((id): id is string => !!id))
    for (const bundleId of bundleIds) comboOrders[bundleId] = (comboOrders[bundleId] ?? 0) + 1
    const suggestionRevenue = lines
      .filter((line) => !line.bundle_id && line.is_upsell_item)
      .reduce((sum, line) => sum + Number(line.subtotal ?? 0), 0)
    if (suggestionRevenue > 0) {
      suggestions = { orders: suggestions.orders + 1, revenue: suggestions.revenue + suggestionRevenue }
    }
  }

  return {
    stats: buildBasketStats(baskets),
    performance: { days: PERFORMANCE_DAYS, comboOrders, suggestions },
  }
}

function comboItemIds(bundles: readonly BundleWithSlots[]): Set<string> {
  const ids = new Set<string>()
  for (const bundle of bundles) {
    for (const slot of bundle.slots ?? []) {
      for (const id of slot.included_item_ids ?? []) ids.add(id)
    }
  }
  return ids
}

type MenuItemRow = Awaited<ReturnType<typeof getMenuItemsByBcgClassification>>[number]

/**
 * The whole menu (`select *` + category), read once per request: the Boost
 * Sales page builds its workspace from it while the streamed "Picked together"
 * section (and Product Analytics) call `getBoostMenu` in the same render.
 * Write paths call `getBoostMenu` once per request, after nothing else has
 * read it, so they never see a pre-write copy.
 */
const readBoostMenuRows = cache((tenantId: string) => getMenuItemsByBcgClassification(tenantId))

function toBoostItem(item: MenuItemRow): BoostItem {
  return {
    id: item.id,
    name: item.name,
    price: Number(item.price ?? 0),
    imageUrl: item.image_url?.trim() || null,
    categoryId: item.category_id ?? null,
    categoryName: item.category?.name ?? null,
    isAvailable: item.is_available !== false,
    role: classifyMenuRole({ categoryName: item.category?.name, itemName: item.name }),
  }
}

function lastCallFromTenant(tenant: BoostTenantFields, menuItems: readonly MenuItemRow[]): BoostLastCall {
  return {
    enabled: tenant.checkout_upsell_enabled === true,
    title: tenant.checkout_upsell_title?.trim() || 'Add to your order',
    subtitle: tenant.checkout_upsell_subtitle?.trim() || '',
    maxItems: tenant.checkout_upsell_max_items ?? 4,
    pickedItemIds: menuItems.filter((item) => item.show_in_checkout_upsell).map((item) => item.id),
  }
}

/** The menu and the cart settings alone — what applying one offer needs, without order history. */
export async function getBoostMenu(tenant: BoostTenantFields): Promise<{ items: BoostItem[]; lastCall: BoostLastCall }> {
  const menuItems = await readBoostMenuRows(tenant.id)
  return { items: menuItems.map(toBoostItem), lastCall: lastCallFromTenant(tenant, menuItems) }
}

export async function getBoostWorkspace(tenant: BoostTenantFields): Promise<BoostWorkspace> {
  const hasPlatformHistory = resolveOrderBackend(tenant) === 'platform'

  const [menuItems, bundles, pairs, history] = await Promise.all([
    readBoostMenuRows(tenant.id),
    getBundlesByTenant(tenant.id),
    getUpsellPairsByTenant(tenant.id),
    hasPlatformHistory ? loadOrderHistory(tenant.id) : Promise.resolve(null),
  ])

  const items = menuItems.map(toBoostItem)

  const upgrades: BoostUpgrade[] = pairs
    .filter((pair) => pair.pair_type === 'upgrade')
    .map((pair) => ({
      id: pair.id,
      sourceId: pair.source_item_id,
      targetId: pair.target_item_id,
      isActive: pair.is_active,
      header: pair.upgrade_header,
      sourceLabel: pair.source_label,
      targetLabel: pair.target_label,
    }))

  const pairings = groupPairings(pairs.filter((pair) => pair.pair_type === 'complementary'))

  const lastCall = lastCallFromTenant(tenant, menuItems)

  const ideas = buildBoostIdeas({
    items: menuItems.map((item, index) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price ?? 0),
      categoryId: item.category_id ?? null,
      categoryName: item.category?.name ?? null,
      imageUrl: item.image_url,
      isAvailable: item.is_available !== false,
      isFeatured: item.is_featured === true,
      order: index,
    })),
    stats: history?.stats ?? null,
    existing: {
      comboItemIds: comboItemIds(bundles),
      upgradeSourceIds: new Set(upgrades.map((u) => u.sourceId)),
      pairingSourceIds: new Set(pairings.flatMap((g) => g.sourceIds)),
      lastCallEnabled: lastCall.enabled,
    },
    limit: IDEA_POOL_SIZE,
  })

  return {
    isEnabled: tenant.menu_engineering_enabled === true,
    items,
    combos: bundles,
    upgrades,
    pairings,
    lastCall,
    ideas,
    historyOrders: history ? history.stats.orderCount : null,
    performance: history?.performance ?? null,
  }
}
