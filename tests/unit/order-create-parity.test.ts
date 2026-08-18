/**
 * Web checkout parity columns + retry idempotency for the platform backend.
 *
 * The parity migration (20260727130000) added `source`, `client_order_id`,
 * `item_count`, `has_upsell_items`, `has_bundle_items` (and item-level
 * upsell/bundle columns), and the vouchers migration added `discount_total` /
 * `discount_data` — but the WEB write path (`createOrder`) populated none of
 * them. Two consequences:
 *
 * - a flaky network on the checkout button could double-create an order (the
 *   mobile adapter dedupes on client_order_id; the web had nothing), and
 * - every downstream reader (mobile mapper, discount reporting, upsell
 *   analytics) must fall back or sees NULLs for web orders.
 *
 * The pure core builds the columns; guardrails pin the wiring.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildOrderParityColumns,
  buildOrderItemParityColumns,
  isDuplicateClientOrderId,
} from '@/lib/order-parity'

const ITEMS = [
  { menu_item_id: 'm1', quantity: 2, isUpsellItem: true },
  { menu_item_id: 'm2', quantity: 1, isBundleItem: true, bundleId: 'b1', bundleName: 'Meal', slotName: 'Drink' },
  { menu_item_id: 'm3', quantity: 3 },
]

describe('buildOrderParityColumns', () => {
  it('stamps the web source, item count, and upsell/bundle flags', () => {
    const columns = buildOrderParityColumns(ITEMS, {})
    expect(columns).toMatchObject({
      source: 'web',
      item_count: 6,
      has_upsell_items: true,
      has_bundle_items: true,
    })
  })

  it('reports plain orders as plain', () => {
    const columns = buildOrderParityColumns([{ menu_item_id: 'm3', quantity: 1 }], {})
    expect(columns.has_upsell_items).toBe(false)
    expect(columns.has_bundle_items).toBe(false)
    expect(columns.item_count).toBe(1)
  })

  it('carries the client order id for retry dedupe, trimmed and bounded', () => {
    expect(buildOrderParityColumns(ITEMS, { clientOrderId: ' abc-123 ' }).client_order_id).toBe('abc-123')
    expect(buildOrderParityColumns(ITEMS, {}).client_order_id).toBeNull()
    // A hostile 10kb "id" must not reach the unique index.
    expect(
      buildOrderParityColumns(ITEMS, { clientOrderId: 'x'.repeat(500) }).client_order_id
    ).toBeNull()
  })

  it('writes the discount breakdown into the reporting columns', () => {
    const payload = {
      total: 50,
      deliveryDiscount: 0,
      lines: [{ label: 'WELCOME10', amount: 50, code: 'WELCOME10' }],
      allocationsByLine: {},
    }
    const columns = buildOrderParityColumns(ITEMS, { discountPayload: payload })
    expect(columns.discount_total).toBe(50)
    expect(columns.discount_data).toEqual(payload)
  })

  it('leaves undiscounted orders with a zero total and no breakdown', () => {
    const columns = buildOrderParityColumns(ITEMS, { discountPayload: null })
    expect(columns.discount_total).toBe(0)
    expect(columns.discount_data).toBeNull()
  })
})

describe('buildOrderItemParityColumns', () => {
  it('promotes the bundle metadata onto the line', () => {
    expect(buildOrderItemParityColumns(ITEMS[1])).toEqual({
      is_upsell_item: false,
      is_bundle_item: true,
      bundle_id: 'b1',
      bundle_name: 'Meal',
      slot_name: 'Drink',
    })
  })

  it('marks an upsell line without inventing bundle fields', () => {
    expect(buildOrderItemParityColumns(ITEMS[0])).toEqual({
      is_upsell_item: true,
      is_bundle_item: false,
      bundle_id: null,
      bundle_name: null,
      slot_name: null,
    })
  })
})

describe('isDuplicateClientOrderId', () => {
  it('recognizes the unique-index violation for a deduped retry', () => {
    expect(
      isDuplicateClientOrderId(
        { code: '23505', message: 'duplicate key value violates unique constraint "orders_tenant_client_order_id_uq"' },
        'abc-123'
      )
    ).toBe(true)
  })

  it('never dedupes without a client order id to dedupe on', () => {
    expect(isDuplicateClientOrderId({ code: '23505', message: 'orders_tenant_client_order_id_uq' }, null)).toBe(false)
  })

  it('never swallows an unrelated constraint violation', () => {
    expect(
      isDuplicateClientOrderId(
        { code: '23505', message: 'duplicate key value violates unique constraint "orders_pkey"' },
        'abc-123'
      )
    ).toBe(false)
    expect(isDuplicateClientOrderId({ code: '23503', message: 'foreign key' }, 'abc-123')).toBe(false)
  })
})

describe('write-path wiring', () => {
  const ordersService = readFileSync(join(process.cwd(), 'src/lib/orders-service.ts'), 'utf8')
  const action = readFileSync(join(process.cwd(), 'src/app/actions/orders.ts'), 'utf8')
  const checkout = readFileSync(join(process.cwd(), 'src/hooks/useCheckout.ts'), 'utf8')

  it('createOrder spreads the parity columns into the insert', () => {
    expect(ordersService).toMatch(/buildOrderParityColumns/)
    expect(ordersService).toMatch(/buildOrderItemParityColumns/)
  })

  it('createOrder returns the existing order for a deduped retry', () => {
    expect(ordersService).toMatch(/isDuplicateClientOrderId/)
  })

  it('the action threads the client order id and skips side effects on a dedupe', () => {
    expect(action).toMatch(/clientOrderId/)
    // Burning vouchers or depleting stock again for the SAME logical order is
    // exactly the double-spend the dedupe exists to prevent.
    expect(action).toMatch(/deduped/)
  })

  it('web checkout sends a per-attempt client order id', () => {
    expect(checkout).toMatch(/clientOrderId/)
  })
})
