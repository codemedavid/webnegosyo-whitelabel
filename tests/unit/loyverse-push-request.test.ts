import { loyversePushBodySchema, MAX_PUSH_LINES } from '@/lib/loyverse/push-request'

const TENANT = '11111111-1111-4111-8111-111111111111'
const line = {
  menu_item_id: 'mi-1',
  menu_item_name: 'Latte',
  addons: [],
  quantity: 1,
  price: 150,
  subtotal: 150,
}

describe('loyversePushBodySchema', () => {
  it('accepts an order id alone', () => {
    expect(loyversePushBodySchema.safeParse({ tenantId: TENANT, orderId: 'k123' }).success).toBe(true)
  })

  it('accepts app lines, normalising nulls to absent', () => {
    const parsed = loyversePushBodySchema.parse({
      tenantId: TENANT,
      items: [{ ...line, special_instructions: null, variations: null }],
      context: 'pos_sale',
    })
    expect(parsed.items?.[0].special_instructions).toBeUndefined()
    expect(parsed.items?.[0].variations).toBeUndefined()
  })

  it('requires an order id or lines', () => {
    expect(loyversePushBodySchema.safeParse({ tenantId: TENANT }).success).toBe(false)
  })

  it('rejects malformed lines instead of casting them', () => {
    expect(loyversePushBodySchema.safeParse({ tenantId: TENANT, items: [{ ...line, quantity: 'two' }] }).success).toBe(false)
    expect(loyversePushBodySchema.safeParse({ tenantId: TENANT, items: [{ ...line, addons: 'cheese' }] }).success).toBe(false)
  })

  it('bounds the number of lines', () => {
    const items = Array.from({ length: MAX_PUSH_LINES + 1 }, () => line)
    expect(loyversePushBodySchema.safeParse({ tenantId: TENANT, items }).success).toBe(false)
  })

  it('rejects a non-uuid tenant and an unknown context', () => {
    expect(loyversePushBodySchema.safeParse({ tenantId: 'x', orderId: 'k1' }).success).toBe(false)
    expect(loyversePushBodySchema.safeParse({ tenantId: TENANT, orderId: 'k1', context: 'refund' }).success).toBe(false)
  })
})
