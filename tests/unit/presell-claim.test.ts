/**
 * The thin pair of calls around apply_presell_order().
 *
 * The database function is the real guard — row lock, conditional decrement,
 * idempotency claim, all in one transaction. This module only translates its
 * three outcomes ('applied', 'already_applied', PRESELL_SHORTFALL exception)
 * into shapes the order action can act on, and never mistakes an outage for
 * any of them.
 */

import {
  applyPresellOrder,
  parsePresellShortfall,
} from '@/lib/presell/claim'

const rpc = jest.fn()
const supabase = { rpc: (...a: unknown[]) => rpc(...a) }

beforeEach(() => {
  jest.clearAllMocks()
})

const LINES = [{ menuItemId: 'm-bilao', presellDate: '2026-12-24', quantity: 2 }]

describe('parsePresellShortfall', () => {
  it('extracts the item and date from the function error', () => {
    expect(parsePresellShortfall('PRESELL_SHORTFALL:m-bilao:2026-12-24')).toEqual({
      menuItemId: 'm-bilao',
      presellDate: '2026-12-24',
    })
  })

  it('returns null for any other error text', () => {
    expect(parsePresellShortfall('connection reset')).toBeNull()
  })

  it('finds the marker inside a wrapped Postgres message', () => {
    expect(
      parsePresellShortfall('ERROR: PRESELL_SHORTFALL:m-bilao:2026-12-24 (SQLSTATE P0001)'),
    ).toEqual({ menuItemId: 'm-bilao', presellDate: '2026-12-24' })
  })
})

describe('applyPresellOrder', () => {
  it('calls the SQL function with snake_case line keys', async () => {
    rpc.mockResolvedValue({ data: 'applied', error: null })

    const result = await applyPresellOrder(supabase, 't1', 'order-1', 'sale', LINES)

    expect(result).toEqual({ status: 'applied' })
    expect(rpc).toHaveBeenCalledWith('apply_presell_order', {
      p_tenant_id: 't1',
      p_order_id: 'order-1',
      p_direction: 'sale',
      p_lines: [{ menu_item_id: 'm-bilao', presell_date: '2026-12-24', quantity: 2 }],
    })
  })

  it('reports an idempotent repeat as already_applied', async () => {
    rpc.mockResolvedValue({ data: 'already_applied', error: null })
    const result = await applyPresellOrder(supabase, 't1', 'order-1', 'sale', LINES)
    expect(result).toEqual({ status: 'already_applied' })
  })

  it('translates a shortfall exception into a refusal, not an error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'PRESELL_SHORTFALL:m-bilao:2026-12-24' },
    })

    const result = await applyPresellOrder(supabase, 't1', 'order-1', 'sale', LINES)

    expect(result).toEqual({
      status: 'shortfall',
      menuItemId: 'm-bilao',
      presellDate: '2026-12-24',
    })
  })

  it('reports an outage as an error — never as applied, never as shortfall', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } })
    const result = await applyPresellOrder(supabase, 't1', 'order-1', 'sale', LINES)
    expect(result.status).toBe('error')
  })

  it('is a no-op success for an order with no presell lines', async () => {
    const result = await applyPresellOrder(supabase, 't1', 'order-1', 'sale', [])
    expect(result).toEqual({ status: 'applied' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
