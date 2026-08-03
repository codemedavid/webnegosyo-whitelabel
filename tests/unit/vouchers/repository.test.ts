/**
 * The Supabase-backed voucher lookup and the redemption write.
 *
 * Two things are worth pinning here, and neither is "does the query run".
 *
 * The read must be tenant-scoped in the query itself, not filtered afterwards.
 * `vouchers` is a per-tenant table reached with the service-role client, which
 * bypasses RLS by design — so a missing `.eq('tenant_id', …)` would let one
 * merchant's code discount another merchant's order, and no policy would stop
 * it.
 *
 * The write must never turn a failed redemption into a successful one. Over-
 * redemption is prevented by the conditional UPDATE inside `redeem_voucher()`,
 * so a caller that swallows the RPC error hands out unlimited uses of a
 * limited voucher.
 */
import { describe, it, expect, jest } from '@jest/globals'
import { createVoucherLookup, redeemVoucher } from '@/lib/vouchers/repository'

interface QueryCall {
  table: string
  eq: Array<[string, unknown]>
  inFilters: Array<[string, readonly unknown[]]>
}

/**
 * Minimal stand-in for the query builder: records what was asked for and
 * resolves to whatever rows the test supplied.
 */
function makeClient(rowsByTable: Record<string, unknown[]>, rpcResult?: { data?: unknown; error?: unknown }) {
  const calls: QueryCall[] = []

  const client = {
    from(table: string) {
      const call: QueryCall = { table, eq: [], inFilters: [] }
      calls.push(call)

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          call.eq.push([column, value])
          return builder
        },
        in: (column: string, values: readonly unknown[]) => {
          call.inFilters.push([column, values])
          return builder
        },
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(resolve),
      }

      return builder
    },
    rpc: jest.fn(async () => rpcResult ?? { data: 'redemption-1', error: null }),
  }

  return { client, calls }
}

const VOUCHER_ROW = {
  id: 'v-1',
  tenant_id: 'tenant-1',
  code: 'SAVE10',
  name: '10% off',
  description: null,
  discount_type: 'percent',
  discount_value: '10',
  max_discount_amount: null,
  min_order_amount: null,
  scope: 'universal',
  is_stackable: true,
  usage_limit_total: null,
  usage_limit_per_customer: null,
  used_count: 0,
  starts_at: null,
  ends_at: null,
  channels: ['checkout'],
  outlet_ids: null,
  is_active: true,
}

describe('createVoucherLookup', () => {
  it('scopes the voucher query to the tenant', async () => {
    const { client, calls } = makeClient({ vouchers: [VOUCHER_ROW], voucher_targets: [] })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createVoucherLookup(client as any).findByCodes('tenant-1', ['SAVE10'])

    const voucherQuery = calls.find((c) => c.table === 'vouchers')
    expect(voucherQuery?.eq).toContainEqual(['tenant_id', 'tenant-1'])
  })

  it('maps rows through the domain mapper, coercing numeric strings', async () => {
    const { client } = makeClient({ vouchers: [VOUCHER_ROW], voucher_targets: [] })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = await createVoucherLookup(client as any).findByCodes('tenant-1', ['SAVE10'])

    expect(found).toHaveLength(1)
    expect(found[0].discountValue).toBe(10)
    expect(found[0].code).toBe('SAVE10')
  })

  it('returns nothing when the tenant has no matching code', async () => {
    const { client } = makeClient({ vouchers: [], voucher_targets: [] })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = await createVoucherLookup(client as any).findByCodes('tenant-1', ['NOPE'])

    expect(found).toEqual([])
  })

  it('does not query targets when no voucher matched', async () => {
    const { client, calls } = makeClient({ vouchers: [], voucher_targets: [] })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createVoucherLookup(client as any).findByCodes('tenant-1', ['NOPE'])

    expect(calls.some((c) => c.table === 'voucher_targets')).toBe(false)
  })

  it('counts a customer redemptions per voucher', async () => {
    const { client, calls } = makeClient({
      voucher_redemptions: [{ voucher_id: 'v-1' }, { voucher_id: 'v-1' }, { voucher_id: 'v-2' }],
    })

    const counts = await createVoucherLookup(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
    ).countCustomerRedemptions('tenant-1', ['v-1', 'v-2'], 'customer-1')

    expect(counts).toEqual({ 'v-1': 2, 'v-2': 1 })
    const query = calls.find((c) => c.table === 'voucher_redemptions')
    expect(query?.eq).toContainEqual(['customer_key', 'customer-1'])
  })
})

describe('redeemVoucher', () => {
  const input = {
    tenantId: 'tenant-1',
    voucherId: 'v-1',
    orderId: 'order-1',
    amount: 100,
    channel: 'checkout' as const,
    customerKey: 'customer-1',
  }

  it('reports success when the conditional update burned a use', async () => {
    const { client } = makeClient({}, { data: 'redemption-1', error: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await redeemVoucher(client as any, input)

    expect(result.redeemed).toBe(true)
    expect(client.rpc).toHaveBeenCalledWith(
      'redeem_voucher',
      expect.objectContaining({
        p_tenant_id: 'tenant-1',
        p_voucher_id: 'v-1',
        p_order_id: 'order-1',
        p_amount: 100,
      }),
    )
  })

  it('reports failure rather than swallowing an exhausted voucher', async () => {
    const { client } = makeClient({}, { data: null, error: { message: 'voucher exhausted' } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await redeemVoucher(client as any, input)

    expect(result.redeemed).toBe(false)
    expect(result.error).toBe('voucher exhausted')
  })

  it('omits the customer key entirely for a guest rather than sending an empty one', async () => {
    const { client } = makeClient({}, { data: 'redemption-1', error: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await redeemVoucher(client as any, { ...input, customerKey: null })

    const args = (client.rpc as jest.Mock).mock.calls[0][1] as Record<string, unknown>
    expect('p_customer_key' in args).toBe(false)
  })
})
