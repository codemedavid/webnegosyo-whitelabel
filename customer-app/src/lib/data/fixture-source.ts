import {
  VALID_CATALOG,
  VALID_CONFIG,
  VALID_LOYALTY,
  VALID_ORDER_DETAIL,
} from '@/fixtures/contract-fixtures'
import { DEMO_ITEM_IMAGES, DEMO_LOGO } from '@/fixtures/demo-overlay'
import {
  appCatalogSchema,
  appConfigSchema,
  appLoyaltySchema,
  appOrderDetailSchema,
  appRewardClaimSchema,
  type AppOrderDetail,
  type AppOrderSummary,
} from '@/lib/contract'
import { AppApiError } from '@/lib/api/app-client'
import { PROTOTYPE_DELIVERY_FEE, PROTOTYPE_FREE_DELIVERY_MINIMUM, priceDraft, prototypeStatusAt } from './fixture-orders'
import { searchDemoPlaces } from './fixture-places'
import { prototypeVoucherPreview } from './fixture-vouchers'
import type { AppDataSource } from './source'

/** Long enough that skeletons are visible and get designed, short enough not to annoy. */
const PROTOTYPE_LATENCY_MS = 450

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), PROTOTYPE_LATENCY_MS))

// Parsed through the real schemas so a fixture that drifts from the contract fails loudly.
const config = appConfigSchema.parse({
  ...VALID_CONFIG,
  theme: { ...VALID_CONFIG.theme, logoUrl: DEMO_LOGO },
  home: {
    blocks: VALID_CONFIG.home.blocks.map((block) =>
      block.type === 'bannerCarousel'
        ? { ...block, banners: block.banners.map((banner) => ({ ...banner, imageUrl: DEMO_ITEM_IMAGES['item-sea-salt'] })) }
        : block,
    ),
  },
})

const catalog = appCatalogSchema.parse({
  ...VALID_CATALOG,
  items: VALID_CATALOG.items.map((item) => ({ ...item, imageUrl: DEMO_ITEM_IMAGES[item.id] ?? null })),
})

const loyalty = appLoyaltySchema.parse(VALID_LOYALTY)
const orderDetail = appOrderDetailSchema.parse(VALID_ORDER_DETAIL)

const summarize = (order: AppOrderDetail): AppOrderSummary => ({
  id: order.id,
  number: order.number,
  status: order.status,
  placedAt: order.placedAt,
  orderKind: order.orderKind,
  orderTypeName: order.orderTypeName,
  outletName: order.outletName,
  total: order.totals.total,
  itemsPreview: order.lines.map((line) => `${line.quantity}× ${line.name}`).slice(0, 5),
})

const pastOrders: AppOrderDetail[] = [
  orderDetail,
  { ...orderDetail, id: 'order-0', number: '31', status: 'delivered', placedAt: '2026-09-27T01:02:00Z' },
]

/** Orders placed in this session; their status follows the prototype kitchen clock. */
const placedOrders: AppOrderDetail[] = []
const FIRST_NEW_NUMBER = 8

const withLiveStatus = (order: AppOrderDetail): AppOrderDetail => ({
  ...order,
  status: prototypeStatusAt(Date.now() - new Date(order.placedAt).getTime()),
})

const allOrders = () => [...placedOrders.map(withLiveStatus), ...pastOrders]

/** Same page size as the real route, so "load more" gets exercised once the demo has enough orders. */
const PAGE_SIZE = 20

/** The demo's idempotency: a retried key returns the order it already placed. */
const placedByKey = new Map<string, AppOrderDetail>()

/** How long the demo's reward QR lasts — the same ~2 minutes the store gives. */
export const PROTOTYPE_CLAIM_LIFETIME_MS = 2 * 60 * 1000
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
const HEX = '0123456789abcdef'
const randomFrom = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')

/**
 * A demo "Use now" code in the store's token shape (no register will accept it).
 * Only the demo's own rewards can be claimed, like the real route.
 */
export function prototypeRewardClaim(rewardId: string, nowMs = Date.now()) {
  if (!loyalty.rewards.some((reward) => reward.id === rewardId))
    return Promise.reject(new AppApiError('refused', 'This reward can’t be used right now.'))
  return delay(
    appRewardClaimSchema.parse({
      token: `v1.${randomFrom(TOKEN_CHARS, 43)}.${randomFrom(HEX, 64)}`,
      expiresAt: new Date(nowMs + PROTOTYPE_CLAIM_LIFETIME_MS).toISOString(),
    }),
  )
}

/** The store reads the prototype prices against (the real menu, once an API URL is set). */
export type LiveReads = Pick<AppDataSource, 'getConfig' | 'getCatalog'>

const fixtureReads: LiveReads = {
  getConfig: () => delay(config),
  getCatalog: () => delay(catalog),
}

/**
 * The prototype data source (demo builds: no EXPO_PUBLIC_APP_API_URL). It
 * behaves like the order routes — idempotent placing, paged history,
 * server-side voucher previews, free-delivery quotes — so the screens are
 * exercised the same way as against the real store.
 */
export function createPrototypeSource(live: LiveReads = fixtureReads): AppDataSource {
  return {
    getConfig: live.getConfig,
    getCatalog: live.getCatalog,
    getLoyalty: () => delay(loyalty),
    claimReward: (rewardId) => prototypeRewardClaim(rewardId),
    getOrders: (cursor) => {
      const all = allOrders().map(summarize)
      const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0
      const next = offset + PAGE_SIZE
      return delay({ orders: all.slice(offset, next), nextCursor: next < all.length ? String(next) : null })
    },
    getOrder: (orderId) => {
      const order = allOrders().find((candidate) => candidate.id === orderId)
      return order ? delay(order) : Promise.reject(new AppApiError('not_found', 'We couldn’t find that order.'))
    },
    placeOrder: async (draft, idempotencyKey) => {
      const existing = placedByKey.get(idempotencyKey)
      if (existing) return delay(withLiveStatus(existing))
      const menu = await live.getCatalog(draft.outletId ?? null)
      await delay(null)
      const number = String(FIRST_NEW_NUMBER + placedOrders.length).padStart(2, '0')
      const order = priceDraft(draft, menu, {
        id: `order-${Date.now().toString(36)}`,
        number,
        placedAt: new Date().toISOString(),
      })
      placedOrders.unshift(order)
      placedByKey.set(idempotencyKey, order)
      return order
    },
    previewVoucher: async (request) => {
      const menu = await live.getCatalog(request.outletId)
      return delay(prototypeVoucherPreview(request, menu))
    },
    quoteDelivery: () =>
      delay({
        fee: PROTOTYPE_DELIVERY_FEE,
        freeDeliveryMinimum: PROTOTYPE_FREE_DELIVERY_MINIMUM,
        etaMinutes: 35,
        quoteToken: null,
        expiresAt: null,
        distanceKm: 3.2,
      }),
    searchPlaces: ({ q }) => delay(searchDemoPlaces(q)),
  }
}

export const fixtureSource: AppDataSource = createPrototypeSource()
