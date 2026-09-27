import { priceOrderLines, type PriceOrderLinesContext, type PriceableOrderLine } from '@/lib/checkout/price-order-lines'
import { loadAndPriceOrderLines } from '@/lib/checkout/load-line-pricing'
import { flattenBundleOrderItems } from '@/lib/bundle-order-items'
import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import type { CheckoutBundle } from '@/lib/checkout/price-bundle-lines'
import type { CartBundleItem } from '@/types/database'

const bundle: CheckoutBundle = {
  id: 'combo', name: 'Lunch combo', is_active: true, pricing_type: 'fixed', fixed_price: 150, discount_percent: null,
  slots: [
    { id: 'main', name: 'Main', category_id: 'food', pick_count: 1, included_item_ids: ['burger'], price_overrides: [] },
    { id: 'drink', name: 'Drink', category_id: 'drinks', pick_count: 1, included_item_ids: null, price_overrides: [] },
  ],
}
const cart: CartBundleItem = {
  id: 'cart-instance', bundleId: 'combo', bundleName: 'Lunch combo', quantity: 1, pricingType: 'fixed', basePrice: 150, subtotal: 150,
  slots: [
    { slotId: 'main', slotName: 'Main', menuItemId: 'burger', menuItemName: 'Burger', menuItemImage: null, menuItemPrice: 100, quantity: 1, priceOverride: 0, selectedAddons: [] },
    { slotId: 'drink', slotName: 'Drink', menuItemId: 'tea', menuItemName: 'Tea', menuItemImage: null, menuItemPrice: 80, quantity: 1, priceOverride: 0, selectedAddons: [] },
  ],
}
const context = (over: Partial<PriceOrderLinesContext> = {}): PriceOrderLinesContext => ({
  storeItems: new Map([
    ['burger', { id: 'burger', name: 'Burger', category_id: 'food', price: 100, is_available: true }],
    ['tea', { id: 'tea', name: 'Tea', category_id: 'drinks', price: 80, is_available: true }],
  ]),
  bundles: new Map([['combo', bundle]]), branchOverrides: new Map(), outletId: null, linkedItems: new Map(), ...over,
})
const lines = () => flattenBundleOrderItems([cart])

describe('authoritative combo checkout', () => {
  test('the real cart payload survives boundary parsing and charges the combo price, not standalone prices', () => {
    const parsed = parseOrderLines(lines())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error('parse failed')
    const result = priceOrderLines(parsed.lines, context())
    expect(result).toMatchObject({ ok: true, itemsSubtotal: 150 })
  })

  test('prices the complete combo and regular items independently', () => {
    const result = priceOrderLines<PriceableOrderLine>([...lines(), {
      menu_item_id: 'burger', menu_item_name: 'fake', price: 0, subtotal: 0, quantity: 1,
    }], context())
    expect(result).toMatchObject({ ok: true, itemsSubtotal: 250 })
  })

  test('uses current discount, modifiers and slot surcharges rather than client prices', () => {
    const ctx = context({ bundles: new Map([['combo', { ...bundle, pricing_type: 'discount', discount_percent: 20,
      slots: bundle.slots.map(slot => slot.id === 'main' ? { ...slot, price_overrides: [{ menu_item_id: 'burger', price_override: 15 }] } : slot),
    }]]) })
    ctx.storeItems = new Map([...ctx.storeItems, ['burger', { id: 'burger', name: 'Burger', category_id: 'food', price: 100,
      addons: [{ id: 'cheese', name: 'Cheese', price: 10 }] }]])
    const input = lines().map(line => line.menu_item_id === 'burger' ? { ...line, addon_ids: ['cheese'], addons: ['Cheese'], price: 0 } : line)
    expect(priceOrderLines(input, ctx)).toMatchObject({ ok: true, itemsSubtotal: 169 })
  })

  test.each([
    ['missing slot', () => lines().slice(0, 1)],
    ['missing metadata', () => lines().map(line => ({ ...line, bundleSlotId: undefined }))],
    ['wrong item for slot', () => lines().map(line => ({ ...line, menu_item_id: 'burger' }))],
    ['forged combo', () => lines().map(line => ({ ...line, bundleId: 'other-tenant-combo' }))],
    ['underclaimed combo quantity', () => lines().map(line => ({ ...line, quantity: 2 }))],
  ])('refuses %s instead of granting a bundle discount', (_name, input) => {
    expect(priceOrderLines<PriceableOrderLine>(input(), context()).ok).toBe(false)
  })

  test('rejects inactive combos and unavailable component dishes', () => {
    expect(priceOrderLines(lines(), context({ bundles: new Map([['combo', { ...bundle, is_active: false }]]) })).ok).toBe(false)
    const ctx = context()
    ctx.storeItems = new Map([...ctx.storeItems, ['tea', { id: 'tea', category_id: 'drinks', price: 80, is_available: false }]])
    expect(priceOrderLines(lines(), ctx).ok).toBe(false)
  })

  test('keeps independently customized instances separate and charges repeated combos correctly', () => {
    const input = flattenBundleOrderItems([cart, { ...cart, id: 'second', quantity: 2 }])
    expect(priceOrderLines(input, context())).toMatchObject({ ok: true, itemsSubtotal: 450 })
  })

  test('preserves every centavo and every ingredient quantity when a price does not divide evenly', () => {
    const ctx = context({ bundles: new Map([['combo', { ...bundle, fixed_price: 100,
      slots: [{ ...bundle.slots[0], pick_count: 3 }],
    }]]) })
    const result = priceOrderLines([{ ...lines()[0], quantity: 3 }], ctx)
    expect(result).toMatchObject({ ok: true, itemsSubtotal: 100 })
    if (!result.ok) throw new Error('pricing failed')
    expect(result.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(3)
    expect(result.lines.map(line => [line.quantity, line.price, line.subtotal])).toEqual([[2, 33.33, 66.66], [1, 33.34, 33.34]])
  })

  test('loads only tenant-owned bundles, refuses disabled bundles and reports read failures', async () => {
    const predicates: unknown[][] = []
    let enabled = true
    let failed = false
    const client = { from(table: string) {
      const data = table === 'menu_items' ? [...context().storeItems.values()] : table === 'tenants' ? { bundles_enabled: enabled } : [bundle]
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { predicates.push([table, key, value]); return query },
        in: () => query,
        maybeSingle: () => query,
        then: (resolve: (value: unknown) => unknown) => resolve({ data, error: failed && table === 'bundles' ? new Error('offline') : null }),
      }
      return query
    } }
    expect(await loadAndPriceOrderLines(client, 'tenant-1', lines(), null)).toMatchObject({ ok: true, itemsSubtotal: 150 })
    expect(predicates).toContainEqual(['bundles', 'tenant_id', 'tenant-1'])
    enabled = false
    expect(await loadAndPriceOrderLines(client, 'tenant-1', lines(), null)).toMatchObject({ ok: false, refused: true })
    failed = true
    expect(await loadAndPriceOrderLines(client, 'tenant-1', lines(), null)).toMatchObject({ ok: false, refused: false })
  })
})
