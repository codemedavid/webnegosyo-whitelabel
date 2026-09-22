/**
 * One colour and glyph per order-type kind, shared by every admin surface.
 *
 * The list and the configure screen each carried their own copy of the same
 * `Record<OrderTypeKind, string>` of Tailwind classes, and they had already
 * drifted — the list used an emoji tile, the detail screen a bare badge, and
 * neither agreed on which green. A merchant should be able to recognise
 * "Delivery" by its colour from anywhere in the admin.
 */

import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'

export interface OrderTypeAccent {
  /** Shown in the icon tile. */
  emoji: string
  /** Classes for the square icon tile (background + border + text). */
  tile: string
  /** Classes for the kind badge. */
  badge: string
}

export const ORDER_TYPE_ACCENTS: Record<OrderTypeKind, OrderTypeAccent> = {
  dine_in: {
    emoji: '🍽️',
    tile: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    badge: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  pickup: {
    emoji: '📦',
    tile: 'border-sky-200 bg-sky-50 text-sky-700',
    badge: 'border-sky-300 bg-sky-50 text-sky-800',
  },
  delivery: {
    emoji: '🚚',
    tile: 'border-orange-200 bg-orange-50 text-orange-700',
    badge: 'border-orange-300 bg-orange-50 text-orange-800',
  },
  grab: {
    emoji: '🛵',
    tile: 'border-teal-200 bg-teal-50 text-teal-700',
    badge: 'border-teal-300 bg-teal-50 text-teal-800',
  },
  foodpanda: {
    emoji: '🐼',
    tile: 'border-pink-200 bg-pink-50 text-pink-700',
    badge: 'border-pink-300 bg-pink-50 text-pink-800',
  },
  other: {
    emoji: '🏪',
    tile: 'border-slate-200 bg-slate-50 text-slate-700',
    badge: 'border-slate-300 bg-slate-50 text-slate-800',
  },
}
