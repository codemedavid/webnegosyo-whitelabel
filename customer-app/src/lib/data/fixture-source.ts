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

export const fixtureSource: AppDataSource = {
  getConfig: () => delay(config),
  getCatalog: () => delay(catalog),
  getLoyalty: () => delay(loyalty),
  getOrders: () => delay(pastOrders.map(summarize)),
  getOrder: (orderId) => {
    const order = pastOrders.find((candidate) => candidate.id === orderId)
    return order ? delay(order) : Promise.reject(new Error('Order not found'))
  },
}
