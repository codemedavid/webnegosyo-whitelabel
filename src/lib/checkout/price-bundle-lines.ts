import { allocateLineTotal } from './allocate-line-total'
/** Authoritative combo pricing. A browser's bundle flag never grants a discount. */
import { resolveOrderLinePrice, MAX_LINE_PRICE } from '@/lib/order-line-price-floor'
import { priceLineModifiers } from '@/lib/order-line-modifier-pricing'
import { findOutletMenuOverride, resolveItemForOutlet } from '@/lib/outlets/outlet-menu-overrides'
import type { PriceableOrderLine, PriceOrderLinesContext, PriceOrderLinesResult } from './price-order-lines'

export interface CheckoutBundle {
  id: string
  name: string
  is_active: boolean
  pricing_type: 'fixed' | 'discount'
  fixed_price: number | null
  discount_percent: number | null
  slots: Array<{
    id: string
    name: string
    category_id: string
    pick_count: number
    included_item_ids: string[] | null
    price_overrides: Array<{ menu_item_id: string; price_override: number }>
  }>
}

const refused = { ok: false as const, error: 'This combo has changed. Please remove it, add it again, and retry.' }
const cents = (value: number) => Math.round(value * 100)


export function priceBundleOrderLines<T extends PriceableOrderLine>(
  lines: readonly T[], context: PriceOrderLinesContext,
): PriceOrderLinesResult<T> {
  const groups = new Map<string, T[]>()
  for (const line of lines) {
    if (!line.bundleId || !line.bundleCartId || !line.bundleSlotId ||
        !Number.isInteger(line.bundleQuantity) || (line.bundleQuantity ?? 0) < 1 || (line.bundleQuantity ?? 0) > 99) return refused
    const group = groups.get(line.bundleCartId) ?? []
    group.push(line)
    groups.set(line.bundleCartId, group)
  }

  const priced: T[] = []
  for (const group of groups.values()) {
    const first = group[0]
    const bundle = context.bundles?.get(first.bundleId!)
    const count = first.bundleQuantity!
    if (!bundle?.is_active || bundle.slots.length === 0 ||
        group.some(line => line.bundleId !== bundle.id || line.bundleQuantity !== count)) return refused
    const slotCounts = new Map<string, number>()
    const canonical: T[] = []
    const weights: number[] = []
    let retailCents = 0
    let extrasCents = 0
    for (const line of group) {
      const slot = bundle.slots.find(slot => slot.id === line.bundleSlotId)
      const item = context.storeItems.get(line.menu_item_id)
      if (!slot || !item || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return refused
      const allowed = slot.included_item_ids
      if (allowed?.length ? !allowed.includes(item.id) : item.category_id !== slot.category_id) return refused
      slotCounts.set(slot.id, (slotCounts.get(slot.id) ?? 0) + line.quantity)
      const override = findOutletMenuOverride(context.branchOverrides, context.outletId, item.id)
      // Reuse standalone availability and branch-listing checks, without using
      // its standalone price as a floor on a legitimate combo.
      const availability = resolveOrderLinePrice({ ...line, price: 0 }, item, override)
      if (!availability.ok) return availability
      const modifiers = priceLineModifiers(line, item, context.linkedItems)
      if (modifiers.unknownIds.length || modifiers.unpricedLabels.length) return refused
      const surcharge = Number(slot.price_overrides?.find(row => row.menu_item_id === item.id)?.price_override ?? 0)
      const retail = Number(resolveItemForOutlet(item, override).price)
      if (!Number.isFinite(surcharge) || surcharge < 0 || !Number.isFinite(retail) || retail < 0) return refused
      retailCents += cents(retail) * line.quantity
      extrasCents += cents(surcharge + modifiers.delta) * line.quantity
      weights.push(Math.max(1, cents(retail + surcharge + modifiers.delta)) * line.quantity)
      canonical.push({ ...line, menu_item_name: item.name || line.menu_item_name,
        bundleName: bundle.name, slotName: slot.name })
    }
    if (bundle.slots.some(slot => !Number.isInteger(slot.pick_count) || slot.pick_count < 1 ||
      slotCounts.get(slot.id) !== slot.pick_count * count)) return refused
    let base: number
    if (bundle.pricing_type === 'fixed') {
      if (bundle.fixed_price === null || !Number.isFinite(Number(bundle.fixed_price)) || Number(bundle.fixed_price) < 0) return refused
      base = cents(Number(bundle.fixed_price))
    } else if (bundle.pricing_type === 'discount') {
      const discount = Number(bundle.discount_percent)
      if (bundle.discount_percent === null || !Number.isFinite(discount) || discount < 0 || discount > 100) return refused
      base = Math.round((retailCents / count) * (1 - discount / 100))
    } else return refused
    const total = base * count + extrasCents
    if (!Number.isSafeInteger(total) || total < 0) return refused
    const allocated = allocateLineTotal(canonical, weights, total)
    if (allocated.some(line => line.price > MAX_LINE_PRICE)) return refused
    priced.push(...allocated)
  }
  return { ok: true, lines: priced, itemsSubtotal: priced.reduce((sum, line) => sum + cents(line.subtotal), 0) / 100 }
}
