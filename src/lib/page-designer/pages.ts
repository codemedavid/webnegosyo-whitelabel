import type { WidgetKind } from '@/lib/hero-builder/types'

import type { PageId, PageMeta } from './types'

/**
 * Never offered on these pages: `embed` runs third-party scripts next to the
 * customer's order; `order-entry` / `store-logo` need the welcome page's
 * runtime (the header block shows the logo here).
 */
const BASE_FREE_KINDS: readonly WidgetKind[] = [
  'heading', 'text', 'buttons', 'image', 'video', 'icon', 'icon-list', 'badge', 'countdown',
  'divider', 'spacer', 'gallery', 'slideshow',
]

const STORE_TOKEN = { token: 'store', label: 'Store name' }

export const PAGE_META: Readonly<Record<PageId, PageMeta>> = {
  tracking: {
    id: 'tracking',
    label: 'Order tracking',
    slug: 'tracking',
    description: 'The page customers watch until their order is done.',
    states: [
      { id: 'pending', label: 'Received' },
      { id: 'confirmed', label: 'Confirmed' },
      { id: 'preparing', label: 'Preparing' },
      { id: 'ready', label: 'Ready' },
      { id: 'delivered', label: 'Completed' },
      { id: 'cancelled', label: 'Cancelled' },
    ],
    tokens: [
      STORE_TOKEN,
      { token: 'name', label: 'Customer first name' },
      { token: 'order_number', label: 'Order number' },
      { token: 'order_type', label: 'Order type' },
      { token: 'total', label: 'Order total' },
    ],
    // Sandboxed HTML is allowed here (owner's call, 2026-11-04); never on checkout.
    freeKinds: [...BASE_FREE_KINDS, 'html'],
  },
  confirmation: {
    id: 'confirmation',
    label: 'Thank-you page',
    slug: 'thank-you',
    description: 'Shown right after a customer places an order.',
    states: [
      { id: 'success', label: 'Order sent' },
      { id: 'failed', label: 'Not confirmed' },
    ],
    tokens: [
      STORE_TOKEN,
      { token: 'name', label: 'Customer first name' },
      { token: 'order_type', label: 'Order type' },
      { token: 'total', label: 'Order total' },
    ],
    freeKinds: [...BASE_FREE_KINDS, 'html'],
  },
  checkout: {
    id: 'checkout',
    label: 'Checkout',
    slug: 'checkout',
    description: 'Where customers enter their details and pay.',
    states: [],
    tokens: [STORE_TOKEN, { token: 'total', label: 'Order total' }],
    freeKinds: BASE_FREE_KINDS,
  },
}

export const PAGE_IDS: readonly PageId[] = ['tracking', 'confirmation', 'checkout']

export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAGE_META, value)
}

export function pageBySlug(slug: unknown): PageId | null {
  return PAGE_IDS.find((id) => PAGE_META[id].slug === slug) ?? null
}
