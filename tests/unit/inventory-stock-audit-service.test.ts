import { recordStockAudit } from '@/lib/inventory/stock-audit-service'

function clientWith(result: { error: unknown } | Error) {
  const insert = jest.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  )
  const from = jest.fn(() => ({ insert }))
  return { client: { from } as never, from, insert }
}

describe('recordStockAudit', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  test('writes one row in the table shape', async () => {
    const { client, from, insert } = clientWith({ error: null })

    await recordStockAudit(client, {
      tenantId: 't1',
      event: 'order_sale',
      outcome: 'applied',
      context: { source: 'pos', actorUserId: 'u1' },
      orderId: 'o1',
      revision: 0,
      outletId: null,
      lines: [{ inventoryItemId: 'rice', name: 'Rice', quantityDelta: -2, enteredQuantity: 2, enteredUnitId: 'g' }],
    })

    expect(from).toHaveBeenCalledWith('inventory_audit_log')
    expect(insert).toHaveBeenCalledWith({
      tenant_id: 't1',
      event: 'order_sale',
      outcome: 'applied',
      source: 'pos',
      actor_user_id: 'u1',
      order_id: 'o1',
      revision: 0,
      outlet_id: null,
      movement_count: 1,
      lines: [{ inventoryItemId: 'rice', name: 'Rice', quantityDelta: -2, enteredQuantity: 2, enteredUnitId: 'g' }],
      is_suspected_duplicate: false,
      detail: null,
    })
  })

  test('an error object from Supabase is logged, not thrown', async () => {
    const { client } = clientWith({ error: { message: 'denied' } })
    await expect(
      recordStockAudit(client, { tenantId: 't1', event: 'order_sale', outcome: 'duplicate', context: { source: 'pos' } }),
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  test('a thrown network error is logged, not thrown', async () => {
    const { client } = clientWith(new Error('fetch failed'))
    await expect(
      recordStockAudit(client, { tenantId: 't1', event: 'order_sale', outcome: 'failed', context: { source: 'system' } }),
    ).resolves.toBeUndefined()
  })

  test('defaults: no actor, no lines, truncated detail', async () => {
    const { client, insert } = clientWith({ error: null })
    await recordStockAudit(client, {
      tenantId: 't1',
      event: 'order_sale',
      outcome: 'failed',
      context: { source: 'web_checkout' },
      detail: 'y'.repeat(3000),
    })
    const row = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(row.actor_user_id).toBeNull()
    expect(row.lines).toEqual([])
    expect(row.movement_count).toBe(0)
    expect((row.detail as string).length).toBe(2000)
  })
})
