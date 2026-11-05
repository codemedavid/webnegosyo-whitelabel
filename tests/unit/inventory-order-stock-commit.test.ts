/**
 * The claim and the ledger rows are ONE database call
 * (`apply_order_stock_claim`, migration 20261103140000). The SQL itself is
 * exercised by tests/sql/run-order-stock-atomic-claim.cjs; this pins the
 * wrapper: what it sends, and that it never misreads an answer.
 */

import {
  commitOrderStockClaim,
  commitOrderStockReversal,
  parseCommittedOrderStock,
  MAX_ORDER_STOCK_ROWS,
} from '@/lib/inventory/order-stock-commit'

const TENANT = '44444444-4444-4444-8444-444444444444'
const ROW = {
  inventory_item_id: 'flour', outlet_id: null, reason: 'sale' as const,
  quantity_delta: -100, entered_quantity: 100, entered_unit_id: 'g',
}

function client(answer: { data?: unknown; error?: unknown }) {
  const calls: Array<[string, Record<string, unknown>]> = []
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push([name, args])
    return { data: answer.data ?? null, error: answer.error ?? null }
  }
  return { supabase: { rpc } as never, calls }
}

describe('commitOrderStockClaim', () => {
  it('sends the claim key and the rows in one call', async () => {
    const { supabase, calls } = client({ data: { status: 'applied', rows: [ROW] } })
    const result = await commitOrderStockClaim(
      supabase,
      { tenantId: TENANT, orderId: 'o1', reason: 'sale', kind: 'edit', revision: 3 },
      [ROW],
    )
    expect(calls).toEqual([['apply_order_stock_claim', {
      p_tenant_id: TENANT, p_order_id: 'o1', p_reason: 'sale', p_kind: 'edit', p_revision: 3,
      p_movements: [ROW], p_mode: 'rows',
    }]])
    expect(result).toEqual({ status: 'applied', rows: [ROW] })
  })

  it('reports a duplicate as a duplicate, not a failure', async () => {
    const { supabase } = client({ data: { status: 'duplicate', rows: [] } })
    const result = await commitOrderStockClaim(
      supabase, { tenantId: TENANT, orderId: 'o1', reason: 'sale', kind: 'order', revision: 0 }, [ROW],
    )
    expect(result.status).toBe('duplicate')
  })

  it('throws on a database error — nothing was written, so the caller may retry', async () => {
    const { supabase } = client({ error: { code: '57014', message: 'timeout' } })
    await expect(commitOrderStockClaim(
      supabase, { tenantId: TENANT, orderId: 'o1', reason: 'sale', kind: 'order', revision: 0 }, [ROW],
    )).rejects.toEqual({ code: '57014', message: 'timeout' })
  })

  it('refuses more rows than the function accepts, before calling it', async () => {
    const { supabase, calls } = client({ data: { status: 'applied', rows: [] } })
    await expect(commitOrderStockClaim(
      supabase,
      { tenantId: TENANT, orderId: 'o1', reason: 'sale', kind: 'order', revision: 0 },
      Array.from({ length: MAX_ORDER_STOCK_ROWS + 1 }, () => ROW),
    )).rejects.toThrow(/more than 500/)
    expect(calls).toHaveLength(0)
  })
})

describe('commitOrderStockReversal', () => {
  it('asks the database to reverse everything, as a void of the order itself', async () => {
    const { supabase, calls } = client({ data: { status: 'applied', rows: [] } })
    await commitOrderStockReversal(supabase, TENANT, 'o1', 2)
    expect(calls[0][1]).toMatchObject({ p_reason: 'void', p_kind: 'order', p_revision: 2, p_movements: [], p_mode: 'reverse_all' })
  })
})

describe('parseCommittedOrderStock', () => {
  it('throws on an unknown status rather than guessing either way', () => {
    expect(() => parseCommittedOrderStock({ status: 'ok' })).toThrow(/unknown status/)
    expect(() => parseCommittedOrderStock(null)).toThrow(/unknown status/)
  })

  it('throws on a malformed row', () => {
    expect(() => parseCommittedOrderStock({ status: 'applied', rows: [{ quantity_delta: 'x' }] })).toThrow(/malformed/)
  })

  it('reads numeric strings (Postgres numerics) as numbers', () => {
    const parsed = parseCommittedOrderStock({ status: 'applied', rows: [{ ...ROW, quantity_delta: '-100', entered_quantity: '100' }] })
    expect(parsed.rows[0]).toEqual(ROW)
  })
})
