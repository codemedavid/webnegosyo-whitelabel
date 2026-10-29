/**
 * How one stored `order_items` row reads on a merchant screen, whoever wrote it.
 *
 * Two writers, two shapes:
 *  - Web checkout: `variation` text, `addons` labels ("Fried Rice ×2") and,
 *    since 20261029121000, `addon_details` — each add-on with the per-portion
 *    price the server charged. `price` is the full price of one dish.
 *  - POS register: no text columns. Sizes AND add-ons are in
 *    `variation_selections` ({ typeName, optionName, priceAdjustment }), and
 *    `price` is the BASE price while `subtotal` includes every option.
 *
 * So the price of one dish is always `subtotal / quantity`, never `price`.
 * Pure; every input is untrusted JSON.
 */

import { addonQuantity } from '@/lib/addon-quantity'

export interface StoredOrderItemLike {
  variation?: string | null
  addons?: readonly string[] | null
  addon_details?: unknown
  variation_selections?: unknown
  quantity: number
  price: number | string
  subtotal: number | string
}

export interface OrderItemChoice {
  label: string
  /** What the choice adds to one dish; null when not recorded. */
  price: number | null
}

export interface OrderItemAddon {
  name: string
  /** Per portion; null when the line predates stored prices. */
  price: number | null
  quantity: number
}

export interface OrderItemView {
  choices: OrderItemChoice[]
  addons: OrderItemAddon[]
  /** The price of ONE dish with its options. */
  unitPrice: number
}

/** Add-on labels carry portions as `Name ×2` (see `addonLabel`). */
const PORTION_LABEL = /^(.*\S)\s*×(\d+)$/

function toNumber(value: unknown): number | null {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseAddonDetails(raw: unknown): OrderItemAddon[] | null {
  if (!Array.isArray(raw)) return null
  const parsed = raw.map((entry) => {
    const record = asRecord(entry)
    if (!record || typeof record.name !== 'string' || record.name.trim() === '') return null
    return {
      name: record.name,
      price: toNumber(record.price),
      quantity: addonQuantity({ quantity: toNumber(record.quantity) ?? undefined }) || 1,
    }
  })
  return parsed.every((entry) => entry !== null) ? (parsed as OrderItemAddon[]) : null
}

function addonsFromLabels(labels: readonly string[] | null | undefined): OrderItemAddon[] {
  return (labels ?? [])
    .filter((label) => typeof label === 'string' && label.trim() !== '')
    .map((label) => {
      const portions = PORTION_LABEL.exec(label.trim())
      return portions
        ? { name: portions[1], price: null, quantity: Number(portions[2]) }
        : { name: label.trim(), price: null, quantity: 1 }
    })
}

function choicesFromSelections(raw: unknown): OrderItemChoice[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      const record = asRecord(entry)
      const option = record && typeof record.optionName === 'string' ? record.optionName.trim() : ''
      if (!record || option === '') return []
      const group = typeof record.typeName === 'string' ? record.typeName.trim() : ''
      return [{ label: group ? `${group}: ${option}` : option, price: toNumber(record.priceAdjustment) }]
    })
  }
  const map = asRecord(raw)
  if (!map) return []
  return Object.entries(map).flatMap(([group, option]) =>
    typeof option === 'string' && option.trim() !== '' ? [{ label: `${group}: ${option}`, price: null }] : []
  )
}

export function describeOrderItem(item: StoredOrderItemLike): OrderItemView {
  const variation = typeof item.variation === 'string' ? item.variation.trim() : ''
  const choices: OrderItemChoice[] = variation
    ? [{ label: variation, price: null }]
    : choicesFromSelections(item.variation_selections)

  const subtotal = toNumber(item.subtotal)
  const price = toNumber(item.price) ?? 0
  const unitPrice = subtotal !== null && item.quantity > 0 ? Math.round((subtotal / item.quantity) * 100) / 100 : price

  return {
    choices,
    addons: parseAddonDetails(item.addon_details) ?? addonsFromLabels(item.addons),
    unitPrice,
  }
}
