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
  type AppOrderDetail,
  type AppOrderSummary,
} from '@/lib/contract'
import { PROTOTYPE_DELIVERY_FEE, PROTOTYPE_VOUCHERS, priceDraft, prototypeStatusAt } from './fixture-orders'
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

/** The two reads that are live from Phase 2; everything else stays prototype until its phase. */
export type LiveReads = Pick<AppDataSource, 'getConfig' | 'getCatalog'>

const fixtureReads: LiveReads = {
  getConfig: () => delay(config),
  getCatalog: () => delay(catalog),
}

/**
 * The prototype data source. With `live` reads (the /api/app/v1 client) the
 * store, theme and menu are real, while sign-in, loyalty, orders, vouchers and
 * delivery stay simulated — orders are priced against whichever menu is shown.
 */
export function createPrototypeSource(live: LiveReads = fixtureReads): AppDataSource {
  return {
    getConfig: live.getConfig,
    getCatalog: live.getCatalog,
    getLoyalty: () => delay(loyalty),
    getOrders: () => delay(allOrders().map(summarize)),
    getOrder: (orderId) => {
      const order = allOrders().find((candidate) => candidate.id === orderId)
      return order ? delay(order) : Promise.reject(new Error('Order not found'))
    },
    placeOrder: async (draft) => {
      const menu = await live.getCatalog(draft.outletId ?? null)
      await delay(null)
      const number = String(FIRST_NEW_NUMBER + placedOrders.length).padStart(2, '0')
      const order = priceDraft(draft, menu, {
        id: `order-${Date.now().toString(36)}`,
        number,
        placedAt: new Date().toISOString(),
      })
      placedOrders.unshift(order)
      return order
    },
    previewVoucher: (code) =>
      delay(PROTOTYPE_VOUCHERS.find((voucher) => voucher.code === code.trim().toUpperCase()) ?? null),
    quoteDelivery: () => delay({ fee: PROTOTYPE_DELIVERY_FEE, etaMinutes: 35 }),
  }
}

export const fixtureSource: AppDataSource = createPrototypeSource()
