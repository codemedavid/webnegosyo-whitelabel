import { describe, it, expect } from '@jest/globals'
import {
  resolveOrderLinePrice,
  type OrderLinePriceInput,
  type StoreMenuItemPricing,
} from '@/lib/order-line-price-floor'
import { buildOutletMenuIndex, findOutletMenuOverride } from '@/lib/outlets/outlet-menu-overrides'

/**
 * What the server charges for one order line.
 *
 * `createOrderAction` cannot trust a submitted price — a customer can post
 * anything — so it floors each line at the database price. The floor is the
 * point of the check and also its hazard: a floor computed from the WRONG price
 * silently overcharges, and the customer sees the change only on their receipt.
 *
 * Two prices were wrong before this module existed:
 *  - a branch selling below the store-wide price had its lines raised back up;
 *  - a discounted item had its sale price raised to list price, because the
 *    floor read `menu_items.price` while the cart charged
 *    `getEffectiveItemPrice`.
 *
 * Both are the same mistake — flooring against a price the customer was never
 * shown — so the floor is decided once, here.
 */

const line = (over: Partial<OrderLinePriceInput> = {}): OrderLinePriceInput => ({
  menu_item_id: 'item-1',
  menu_item_name: 'Adobo',
  price: 180,
  quantity: 1,
  subtotal: 180,
  ...over,
})

const storeItem = (over: Partial<StoreMenuItemPricing> = {}): StoreMenuItemPricing => ({
  id: 'item-1',
  price: 180,
  discounted_price: null,
  is_available: true,
  ...over,
})

const overrideFor = (
  row: Partial<{
    is_listed: boolean
    is_available: boolean
    price: number | null
    discounted_price: number | null
    discount_cleared: boolean
  }> = {}
) =>
  findOutletMenuOverride(
    buildOutletMenuIndex([
      {
        outlet_id: 'branch-a',
        menu_item_id: 'item-1',
        is_listed: true,
        is_available: true,
        price: null,
        discounted_price: null,
        discount_cleared: false,
        ...row,
      },
    ]),
    'branch-a',
    'item-1'
  )

describe('resolveOrderLinePrice — the existing guarantees', () => {
  it('rejects a line for an item the tenant does not have', () => {
    const result = resolveOrderLinePrice(line(), undefined, null)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Adobo')
  })

  it('raises an under-submitted price to the store price', () => {
    const result = resolveOrderLinePrice(line({ price: 1, subtotal: 1 }), storeItem(), null)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.price).toBe(180)
  })

  it('accepts a price above the floor, because variations add to it', () => {
    const result = resolveOrderLinePrice(line({ price: 220, subtotal: 220 }), storeItem(), null)

    if (result.ok) expect(result.price).toBe(220)
  })

  it('recomputes a subtotal that does not match price times quantity', () => {
    const result = resolveOrderLinePrice(line({ quantity: 3, subtotal: 5 }), storeItem(), null)

    if (result.ok) expect(result.subtotal).toBe(540)
  })

  it('rejects an absurd quantity', () => {
    expect(resolveOrderLinePrice(line({ quantity: 0 }), storeItem(), null).ok).toBe(false)
    expect(resolveOrderLinePrice(line({ quantity: 100 }), storeItem(), null).ok).toBe(false)
    expect(resolveOrderLinePrice(line({ quantity: 1.5 }), storeItem(), null).ok).toBe(false)
  })

  it('rejects a price beyond any plausible menu', () => {
    const result = resolveOrderLinePrice(line({ price: 2_000_000 }), storeItem(), null)

    expect(result.ok).toBe(false)
  })

  it('never mutates the submitted line', () => {
    const submitted = line({ price: 1, subtotal: 1 })

    resolveOrderLinePrice(submitted, storeItem(), null)

    expect(submitted.price).toBe(1)
  })
})

describe('resolveOrderLinePrice — a store-wide sale', () => {
  it('charges the sale price rather than raising it to list', () => {
    // The cart charges getEffectiveItemPrice; a floor built from the list price
    // would overcharge every discounted item in the catalogue.
    const result = resolveOrderLinePrice(
      line({ price: 150, subtotal: 150 }),
      storeItem({ discounted_price: 150 }),
      null
    )

    if (result.ok) expect(result.price).toBe(150)
  })

  it('still floors a line submitted below the sale price', () => {
    const result = resolveOrderLinePrice(
      line({ price: 10, subtotal: 10 }),
      storeItem({ discounted_price: 150 }),
      null
    )

    if (result.ok) expect(result.price).toBe(150)
  })
})

describe('resolveOrderLinePrice — the branch the order was placed at', () => {
  it('accepts a branch price BELOW the store-wide price', () => {
    // The bug this module exists for: the customer is quoted 160 at this
    // branch, and the old floor raised the charge to 180 after checkout.
    const result = resolveOrderLinePrice(
      line({ price: 160, subtotal: 160 }),
      storeItem(),
      overrideFor({ price: 160 })
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.price).toBe(160)
  })

  it('floors at the branch price when the branch charges more', () => {
    const result = resolveOrderLinePrice(
      line({ price: 180, subtotal: 180 }),
      storeItem(),
      overrideFor({ price: 210 })
    )

    if (result.ok) expect(result.price).toBe(210)
  })

  it('honours a branch-only sale price', () => {
    const result = resolveOrderLinePrice(
      line({ price: 120, subtotal: 120 }),
      storeItem(),
      overrideFor({ discounted_price: 120 })
    )

    if (result.ok) expect(result.price).toBe(120)
  })

  it('charges full price at a branch that opted out of the store-wide sale', () => {
    const result = resolveOrderLinePrice(
      line({ price: 150, subtotal: 150 }),
      storeItem({ discounted_price: 150 }),
      overrideFor({ discount_cleared: true })
    )

    if (result.ok) expect(result.price).toBe(180)
  })
})

describe('resolveOrderLinePrice — what a branch will not sell', () => {
  it('rejects a dish the branch does not carry', () => {
    const result = resolveOrderLinePrice(line(), storeItem(), overrideFor({ is_listed: false }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not available|not offered|Adobo/i)
  })

  it("rejects a dish the branch has 86'd", () => {
    const result = resolveOrderLinePrice(line(), storeItem(), overrideFor({ is_available: false }))

    expect(result.ok).toBe(false)
  })

  it('rejects a dish the merchant took off the whole menu', () => {
    const result = resolveOrderLinePrice(line(), storeItem({ is_available: false }), null)

    expect(result.ok).toBe(false)
  })

  it('sells a dish no branch has an opinion about', () => {
    expect(resolveOrderLinePrice(line(), storeItem(), null).ok).toBe(true)
  })
})
