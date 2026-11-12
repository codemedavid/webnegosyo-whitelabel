/**
 * Payment methods for Owl — the pure half: matching the order types a person
 * named to the store's own, and describing a method in one line.
 *
 * A method with NO order types never shows at checkout (the storefront joins
 * `payment_method_order_types` with an inner join), so "no order types named"
 * means every order type the store has switched on, never none.
 */

import { foldName } from '@/lib/assistant/insights/menu-import'

export interface StoreOrderType {
  id: string
  /** dine_in | pickup | delivery | grab | foodpanda | other … (never renamed). */
  type: string
  name: string
  isEnabled: boolean
}

export interface AssistantPaymentMethod {
  id: string
  name: string
  details: string | null
  qrCodeUrl: string | null
  isActive: boolean
  requireProof: boolean
  orderTypeIds: string[]
  updatedAt: string | null
}

/** Words people use for an order type, folded. */
const TYPE_WORDS: Readonly<Record<string, readonly string[]>> = {
  dine_in: ['dine in', 'dine-in', 'dinein', 'kain dito', 'dito'],
  pickup: ['pickup', 'pick up', 'pick-up', 'takeout', 'take out', 'take-out', 'takeaway', 'take away'],
  delivery: ['delivery', 'deliver', 'padala', 'hatid'],
}

export type OrderTypeMatch = { ok: true; ids: string[] } | { ok: false; unknown: string[] }

/**
 * The store's order types a person named (by the store's own label or the
 * usual words for its kind); null/empty = every enabled one.
 */
export function matchOrderTypes(named: readonly string[] | null, orderTypes: readonly StoreOrderType[]): OrderTypeMatch {
  const enabled = orderTypes.filter((type) => type.isEnabled)
  if (!named || named.length === 0) return { ok: true, ids: enabled.map((type) => type.id) }
  const ids = new Set<string>()
  const unknown: string[] = []
  for (const raw of named) {
    const word = foldName(raw)
    if (word === 'all' || word === 'lahat') {
      for (const type of enabled) ids.add(type.id)
      continue
    }
    const hits = orderTypes.filter((type) => foldName(type.name) === word || foldName(type.type) === word || (TYPE_WORDS[type.type] ?? []).includes(word))
    if (hits.length === 0) unknown.push(raw)
    for (const hit of hits) ids.add(hit.id)
  }
  return unknown.length > 0 ? { ok: false, unknown } : { ok: true, ids: [...ids] }
}

/** "Dine in, Pickup" — the store's own labels, in the store's order. */
export function orderTypeLabels(ids: readonly string[], orderTypes: readonly StoreOrderType[]): string {
  const names = orderTypes.filter((type) => ids.includes(type.id)).map((type) => type.name)
  return names.length > 0 ? names.join(', ') : 'No order types (hidden at checkout)'
}

/** Payment details a customer reads at checkout, cut to the store's limit and stripped of control characters. */
export function cleanPaymentDetails(value: string | null): string | null {
  if (value === null) return null
  const cleaned = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 500) : null
}

export function findMethodByName(methods: readonly AssistantPaymentMethod[], name: string): AssistantPaymentMethod | null {
  const wanted = foldName(name)
  return methods.find((method) => foldName(method.name) === wanted) ?? null
}
