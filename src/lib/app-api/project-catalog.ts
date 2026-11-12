import { createHash } from 'node:crypto'
import {
  appCategorySchema,
  appMenuItemSchema,
  appOrderTypeSchema,
  appOutletSchema,
  appPaymentMethodSchema,
  type AppCatalog,
  type AppCategory,
  type AppMenuItem,
  type AppModifierGroup,
  type AppOrderType,
  type AppOutlet,
  type AppPaymentMethod,
} from '@/lib/app-contract'
import { getEffectiveItemPrice } from '@/lib/cart-utils'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import { isOptionAvailable } from '@/lib/modifier-groups'
import type { LinkedItemSnapshot } from '@/lib/modifier-linked-options'
import { isOrderTypeKind } from '@/lib/order-types/order-type-kinds'
import { buildOutletMenuIndex, resolveMenuForOutlet, type OutletMenuOverrideRow } from '@/lib/outlets/outlet-menu-overrides'
import type { Category, MenuItem, ModifierGroup, OrderType, Outlet, PaymentMethod } from '@/types/database'
import { appModifierGroups, groupSelectLimits, linkedItemsAtBranch, modifierGroupsFor } from './item-modifier-groups'

/**
 * `/api/app/v1/catalog`: the menu as the customer app shows it, projected from
 * the SAME reads the web storefront and checkout use, so the app and the web
 * never disagree about a price, an option or an order type.
 *
 * Group and option ids are the web's own (including the normaliser's
 * `legacy-variations` / `legacy-addons`), so an app order's picks map straight
 * back onto the web's pricing when the server reprices it.
 */

type AppPairing = AppCatalog['pairings'][number]

export interface PaymentMethodRow extends Pick<PaymentMethod, 'id' | 'name' | 'details' | 'require_payment_proof' | 'skip_payment_details'> {
  payment_method_order_types?: ReadonlyArray<{ order_type_id: string | null }> | null
}

export interface ComplementaryPairRow {
  source_item_id: string
  target_item_id: string
  display_order: number | null
}

export interface AppCatalogInput {
  tenant: Record<string, unknown>
  categories: readonly Category[]
  menuItems: readonly MenuItem[]
  orderTypes: readonly OrderType[]
  outlets: readonly Outlet[]
  outletOverrides: readonly OutletMenuOverrideRow[]
  /** Price and list the menu for this branch; null = the store-wide menu. */
  outletId: string | null
  paymentMethods: readonly PaymentMethodRow[]
  pairs: readonly ComplementaryPairRow[]
}

const BADGE_MAX = 24
const INSTRUCTIONS_MAX = 2000
const PAIRINGS_PER_ITEM = 6

const httpsOrNull = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.startsWith('https://') ? value : null

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Options without a name can't be shown to a customer (13 platform stores
 * carry one, 2026-11-12), so they are left out instead of failing the whole
 * catalog in the app's contract check.
 */
function projectGroup(group: ModifierGroup): AppModifierGroup {
  return {
    id: group.id,
    name: trimmed(group.name),
    selectionMode: group.selection_mode ?? 'choice',
    ...groupSelectLimits(group),
    options: group.options.flatMap((option) => {
      const name = trimmed(option.name)
      if (!name) return []
      return [{
        id: option.id,
        name,
        priceDelta: option.price_modifier ?? 0,
        imageUrl: httpsOrNull(option.image_url),
        isDefault: option.is_default === true,
        isAvailable: isOptionAvailable(option),
      }]
    }),
  }
}

/**
 * A group left with nothing to pick disappears; if it had to be answered, the
 * dish can't be ordered from the app, so it shows as unavailable.
 */
function shownGroups(groups: readonly AppModifierGroup[]): { groups: AppModifierGroup[]; isAnswerable: boolean } {
  const isAnswerable = groups.every((group) => group.minSelect === 0 || group.options.some((option) => option.isAvailable))
  return { groups: groups.filter((group) => group.options.length > 0), isAnswerable }
}

/**
 * The last guard before the wire: one malformed row (a blank name, a bad
 * price) drops only itself, never the whole menu the app checks it against.
 */
function keepValid<T>(rows: readonly T[], schema: { safeParse(value: unknown): { success: boolean } }, kind: string, tenantId: unknown): T[] {
  const kept = rows.filter((row) => schema.safeParse(row).success)
  if (kept.length < rows.length) {
    console.error('[app-api:catalog] dropped rows that fail the app contract', { tenantId, kind, dropped: rows.length - kept.length })
  }
  return kept
}

function projectItem(
  item: MenuItem,
  category: Category | undefined,
  input: AppCatalogInput,
  linked: ReadonlyMap<string, LinkedItemSnapshot>,
): AppMenuItem {
  const price = getEffectiveItemPrice(item)
  const { groups, isAnswerable } = shownGroups(appModifierGroups(item, category, input.tenant, linked).map(projectGroup))
  const badge = input.tenant.menu_engineering_enabled === true && item.badge_text ? item.badge_text.slice(0, BADGE_MAX) : null
  return {
    id: item.id,
    categoryId: item.category_id,
    name: item.name,
    description: item.description ?? '',
    price,
    compareAtPrice: price < item.price ? item.price : null,
    imageUrl: httpsOrNull(item.image_url),
    badge,
    isAvailable: isMenuItemOrderable(item) && isAnswerable,
    isFeatured: item.is_featured === true,
    modifierGroups: groups,
  }
}

function projectOrderTypes(orderTypes: readonly OrderType[]): AppOrderType[] {
  return orderTypes.flatMap((orderType) => {
    if (!isOrderTypeKind(orderType.type)) return []
    const minimum = Number(orderType.minimum_order_amount ?? 0)
    return [{ id: orderType.id, kind: orderType.type, name: orderType.name, minimumOrder: Number.isFinite(minimum) && minimum > 0 ? minimum : 0 }]
  })
}

function projectOutlets(outlets: readonly Outlet[]): AppOutlet[] {
  return outlets.map((outlet) => ({
    id: outlet.id,
    name: outlet.name,
    address: outlet.address ?? null,
    imageUrl: httpsOrNull(outlet.image_url),
    latitude: typeof outlet.latitude === 'number' ? outlet.latitude : null,
    longitude: typeof outlet.longitude === 'number' ? outlet.longitude : null,
    supportsPickup: outlet.supports_pickup === true,
    supportsDelivery: outlet.supports_delivery === true,
    supportsDineIn: outlet.supports_dine_in === true,
  }))
}

/**
 * No method is marked "online" yet (PayMongo is Phase 6). `skip_payment_details`
 * without a proof requirement is how the web marks cash-like methods; the name
 * is never used to guess.
 */
function projectPaymentMethods(rows: readonly PaymentMethodRow[]): AppPaymentMethod[] {
  return rows.map((row) => {
    const requiresProof = row.require_payment_proof === true
    const details = row.details?.trim()
    return {
      id: row.id,
      name: row.name,
      kind: row.skip_payment_details === true && !requiresProof ? 'cash' : 'manual',
      instructions: details ? details.slice(0, INSTRUCTIONS_MAX) : null,
      requiresProof,
      orderTypeIds: (row.payment_method_order_types ?? []).flatMap((link) => (link.order_type_id ? [link.order_type_id] : [])),
    }
  })
}

function projectPairings(pairs: readonly ComplementaryPairRow[], onMenu: ReadonlySet<string>): AppPairing[] {
  const sorted = [...pairs].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const bySource = new Map<string, string[]>()
  for (const pair of sorted) {
    if (!onMenu.has(pair.source_item_id) || !onMenu.has(pair.target_item_id) || pair.source_item_id === pair.target_item_id) continue
    const targets = bySource.get(pair.source_item_id) ?? []
    if (targets.length < PAIRINGS_PER_ITEM && !targets.includes(pair.target_item_id)) bySource.set(pair.source_item_id, [...targets, pair.target_item_id])
  }
  return [...bySource.entries()].map(([sourceItemId, targetItemIds]) => ({ sourceItemId, targetItemIds }))
}

function versionOf(content: Omit<AppCatalog, 'version'>): string {
  return `cat-${createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16)}`
}

export function projectAppCatalog(input: AppCatalogInput): AppCatalog {
  const categoriesById = new Map(input.categories.filter((c) => c.is_active).map((c) => [c.id, c]))
  // Presell dishes need a date picked from their allocation, which the app can't do yet.
  const sellable = input.menuItems.filter((item) => categoriesById.has(item.category_id) && item.presell_enabled !== true)
  const branchIndex = buildOutletMenuIndex(input.outletOverrides)
  const branchMenu = resolveMenuForOutlet(sellable, branchIndex, input.outletId)

  // Linked options take the branch's price and availability too (an unlisted dish resolves as unavailable).
  const linked = linkedItemsAtBranch(
    branchMenu.map((item) => modifierGroupsFor(item, categoriesById.get(item.category_id), input.tenant)),
    input.menuItems,
    branchIndex,
    input.outletId,
  )

  const tenantId = input.tenant.id
  const projectedCategories: AppCategory[] = input.categories
    .filter((category) => categoriesById.has(category.id))
    .map((category) => ({ id: category.id, name: trimmed(category.name), description: category.description?.trim() || null, imageUrl: null }))
  const shownCategories = new Set(keepValid(projectedCategories, appCategorySchema, 'category', tenantId).map((category) => category.id))
  const items = keepValid(
    branchMenu
      .filter((item) => shownCategories.has(item.category_id))
      .map((item) => projectItem(item, categoriesById.get(item.category_id), input, linked)),
    appMenuItemSchema,
    'item',
    tenantId,
  )
  const used = new Set(items.map((item) => item.categoryId))
  const categories = projectedCategories.filter((category) => used.has(category.id))

  const content = {
    categories,
    items,
    orderTypes: keepValid(projectOrderTypes(input.orderTypes), appOrderTypeSchema, 'order type', tenantId),
    outlets: keepValid(projectOutlets(input.outlets), appOutletSchema, 'outlet', tenantId),
    pairings: projectPairings(input.pairs, new Set(items.map((item) => item.id))),
    paymentMethods: keepValid(projectPaymentMethods(input.paymentMethods), appPaymentMethodSchema, 'payment method', tenantId),
  }
  return { version: versionOf(content), ...content }
}
