/**
 * The slice of a store a Messenger reply needs, built from the cached
 * storefront menu. Pure.
 *
 * Only what a customer can order right now reaches a chat: active categories,
 * dishes not marked sold out (`is_available === false` also covers auto-86),
 * and categories with at least one such dish. Multi-branch stores show the
 * store-wide menu; the branch is chosen at web checkout (owner, 2026-11-10).
 */

import type { MenuContents } from '@/storefront/data/menu-data'
import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { listStoreAddresses } from '@/lib/qr-print/qr-links'
import { getStoreOpenStatus, getZonedNow, formatTimeLabel } from '@/lib/store-open-status'
import { normalizeOperatingHours, parseHHMM } from '@/lib/operating-hours'

/** Dishes and categories as the storefront menu read returns them (`getStorefrontMenu`). */
type Category = MenuContents['categories'][number]
type MenuItem = MenuContents['menuItems'][number]

export interface ReplyCategory {
  id: string
  name: string
}

export interface ReplyItem {
  id: string
  categoryId: string
  name: string
  description: string
  price: number
  discountedPrice: number | null
  imageUrl: string | null
  /** Has a required choice (size, flavour…): ordering needs the item page. */
  needsChoices: boolean
  isFeatured: boolean
}

export interface ReplyStore {
  name: string
  /** Absolute, no trailing slash. */
  baseUrl: string
  logoUrl: string | null
  /** "Open today 9:00 AM – 9:00 PM", or null when the store set no hours. */
  hoursText: string | null
  /**
   * The store's own hours say open right now (no hours = open). Read by the
   * "Only when open / closed" automations; independent of whether the
   * storefront enforces hours or has launched. Absent = open.
   */
  isOpenNow?: boolean
  address: string | null
  categories: ReplyCategory[]
  items: ReplyItem[]
}

export interface StoreViewTenant {
  name: string
  slug: string
  domain?: string | null
  logo_url?: string | null
  operating_hours?: unknown
  timezone?: string | null
  restaurant_address?: string | null
  footer_address?: string | null
}

export interface StoreViewInput {
  tenant: StoreViewTenant
  categories: readonly Category[]
  menuItems: readonly MenuItem[]
  rootDomain: string | null
  appUrl: string | null
  now: Date
}

/** Meta fetches images itself: only absolute https URLs work. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  return /^https:\/\/[^\s]+$/.test(trimmed) && trimmed.length <= 1000 ? trimmed : null
}

function needsChoices(item: MenuItem): boolean {
  const groups = normalizeModifierGroups(item)
  if (groups.some((group) => group.min_select > 0)) return true
  // Legacy flat variations read as optional, but the storefront makes the guest pick one.
  return (item.variations?.length ?? 0) > 0 && !(item.modifier_groups && item.modifier_groups.length > 0)
}

function hoursText(tenant: StoreViewTenant, now: Date): string | null {
  const hours = normalizeOperatingHours(tenant.operating_hours)
  if (!hours) return null
  const today = hours[String(getZonedNow(now, tenant.timezone).weekday)]
  if (!today) return null
  if (today.closed) return 'Closed today'
  const open = parseHHMM(today.open)
  const close = parseHHMM(today.close)
  if (open === null || close === null) return null
  return `Open today ${formatTimeLabel(open)} – ${formatTimeLabel(close)}`
}

function isOpenByHours(tenant: StoreViewTenant, now: Date): boolean {
  return getStoreOpenStatus({ operating_hours: tenant.operating_hours, timezone: tenant.timezone, enforce_operating_hours: true, is_prelaunch: false }, now).isOpen
}

function toReplyItem(item: MenuItem): ReplyItem {
  const discounted = typeof item.discounted_price === 'number' && item.discounted_price > 0 && item.discounted_price < item.price
    ? item.discounted_price
    : null
  return {
    id: item.id,
    categoryId: item.category_id,
    name: item.name.trim(),
    description: (item.description ?? '').trim(),
    price: item.price,
    discountedPrice: discounted,
    imageUrl: safeImageUrl(item.image_url),
    needsChoices: needsChoices(item),
    isFeatured: item.is_featured === true,
  }
}

export function storeBaseUrl(tenant: StoreViewTenant, rootDomain: string | null, appUrl: string | null): string | null {
  const [first] = listStoreAddresses({ slug: tenant.slug, domain: tenant.domain ?? null, rootDomain, appUrl })
  return first?.baseUrl ?? null
}

export function buildReplyStore(input: StoreViewInput): ReplyStore | null {
  const baseUrl = storeBaseUrl(input.tenant, input.rootDomain, input.appUrl)
  if (!baseUrl) return null

  const activeCategories = [...input.categories]
    .filter((category) => category.is_active !== false)
    .sort((a, b) => a.order - b.order)
  const activeIds = new Set(activeCategories.map((category) => category.id))

  const items = [...input.menuItems]
    .filter((item) => item.is_available !== false && activeIds.has(item.category_id) && item.name.trim().length > 0)
    .sort((a, b) => a.order - b.order)
    .map(toReplyItem)

  const withItems = new Set(items.map((item) => item.categoryId))
  const address = (input.tenant.restaurant_address || input.tenant.footer_address || '').trim()

  return {
    name: input.tenant.name.trim(),
    baseUrl,
    logoUrl: safeImageUrl(input.tenant.logo_url),
    hoursText: hoursText(input.tenant, input.now),
    isOpenNow: isOpenByHours(input.tenant, input.now),
    address: address || null,
    categories: activeCategories
      .filter((category) => withItems.has(category.id))
      .map((category) => ({ id: category.id, name: category.name.trim() })),
    items,
  }
}
