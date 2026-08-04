/**
 * Burning redemptions once the order exists, and the wiring that gets a
 * discount from a typed code into the row that is billed.
 *
 * `burnRedemptions` takes an order id it cannot invent. That is the point:
 * a use must never be burned for an order that was never saved, so the
 * redemption call is only reachable after the insert has returned. The unique
 * `(voucher_id, order_id)` index then makes a retry a no-op rather than a
 * second burn.
 *
 * A failed burn must not fail the order. The customer has paid and the food is
 * being made; refusing the order at that point to protect a coupon count is the
 * wrong trade. It is reported so the caller can log it.
 */
import { describe, it, expect, jest } from '@jest/globals'
import { burnRedemptions, loadCategoryMap } from '@/lib/vouchers/order-voucher-flow'

/**
 * `redeem_voucher()` returns the new redemption's uuid, or null when the
 * conditional claim was refused. The mock returns both fields for that reason:
 * a stub that only carries `error` cannot express the refusal the database
 * actually produces.
 */
function makeClient(rpcResults: Array<{ data?: unknown; error: unknown }>) {
  let call = 0
  return {
    rpc: jest.fn(async () => rpcResults[call++] ?? { data: 'redemption-1', error: null }),
  }
}

const BURNED = { data: 'redemption-1', error: null }

const REDEMPTIONS = [
  { voucherId: 'v-1', code: 'SAVE10', amount: 100 },
  { voucherId: 'v-2', code: 'FREEDEL', amount: 50 },
]

const BURN_INPUT = {
  tenantId: 'tenant-1',
  orderId: 'order-1',
  channel: 'checkout' as const,
  customerKey: 'customer-1',
  outletId: null,
}

describe('burnRedemptions', () => {
  it('burns one use per applied voucher, keyed on the saved order', async () => {
    const client = makeClient([BURNED, BURNED])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await burnRedemptions(client as any, { ...BURN_INPUT, redemptions: REDEMPTIONS })

    expect(result.burned).toBe(2)
    expect(result.failures).toEqual([])
    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(client.rpc).toHaveBeenNthCalledWith(
      1,
      'redeem_voucher',
      expect.objectContaining({ p_voucher_id: 'v-1', p_order_id: 'order-1', p_amount: 100 }),
    )
  })

  it('does nothing at all when no voucher was applied', async () => {
    const client = makeClient([])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await burnRedemptions(client as any, { ...BURN_INPUT, redemptions: [] })

    expect(client.rpc).not.toHaveBeenCalled()
    expect(result.burned).toBe(0)
  })

  it('reports a failed burn without throwing, so a saved order still succeeds', async () => {
    const client = makeClient([{ data: null, error: { message: 'voucher exhausted' } }, BURNED])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await burnRedemptions(client as any, { ...BURN_INPUT, redemptions: REDEMPTIONS })

    expect(result.burned).toBe(1)
    expect(result.failures).toEqual([expect.stringContaining('SAVE10')])
  })

  it('reports a refused claim the database returned without an error', async () => {
    // An exhausted or out-of-window voucher comes back as a null row and no
    // error. Counting that as burned is how a limited code stays honoured
    // forever, with nothing in the log to say so.
    const client = makeClient([{ data: null, error: null }, BURNED])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await burnRedemptions(client as any, { ...BURN_INPUT, redemptions: REDEMPTIONS })

    expect(result.burned).toBe(1)
    expect(result.failures).toEqual([expect.stringContaining('SAVE10')])
  })

  it('still burns the remaining vouchers after one fails', async () => {
    const client = makeClient([{ data: null, error: { message: 'nope' } }, BURNED])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await burnRedemptions(client as any, { ...BURN_INPUT, redemptions: REDEMPTIONS })

    expect(client.rpc).toHaveBeenCalledTimes(2)
  })
})

describe('loadCategoryMap', () => {
  function makeQueryClient(rows: unknown[] | null, error: unknown = null) {
    const calls: Array<[string, unknown]> = []
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        calls.push([column, value])
        return builder
      },
      in: (column: string, values: unknown) => {
        calls.push([column, values])
        return builder
      },
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({ data: rows, error }).then(resolve),
    }
    return { client: { from: () => builder }, calls }
  }

  it('maps each menu item to its category', async () => {
    const { client } = makeQueryClient([
      { id: 'm-1', category_id: 'cat-food' },
      { id: 'm-2', category_id: 'cat-drinks' },
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = await loadCategoryMap(client as any, 'tenant-1', ['m-1', 'm-2'])

    expect(map).toEqual({ 'm-1': 'cat-food', 'm-2': 'cat-drinks' })
  })

  it('omits items with no category rather than inventing one', async () => {
    const { client } = makeQueryClient([{ id: 'm-1', category_id: null }])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = await loadCategoryMap(client as any, 'tenant-1', ['m-1'])

    expect(map).toEqual({})
  })

  it('returns an empty map on a failed query, so a category voucher matches nothing', async () => {
    // Widening the voucher to the whole cart on a failed lookup would discount
    // items it was never meant to touch.
    const { client } = makeQueryClient(null, { message: 'boom' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = await loadCategoryMap(client as any, 'tenant-1', ['m-1'])

    expect(map).toEqual({})
  })

  it('does not query when there are no item ids', async () => {
    const from = jest.fn()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = await loadCategoryMap({ from } as any, 'tenant-1', [])

    expect(from).not.toHaveBeenCalled()
    expect(map).toEqual({})
  })

  it('scopes the lookup to the tenant', async () => {
    const { client, calls } = makeQueryClient([])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadCategoryMap(client as any, 'tenant-1', ['m-1'])

    expect(calls).toContainEqual(['tenant_id', 'tenant-1'])
  })
})
