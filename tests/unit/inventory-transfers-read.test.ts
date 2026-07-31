/**
 * Reading transfers for a screen.
 *
 * The RLS policy already limits which transfer rows an account can select —
 * either end may see its own. What this read has to get right is the shape:
 * the lines have to arrive with ingredient names on them, because a transfer
 * listing raw item ids is a document nobody can check against a physical box.
 *
 * It also has to fail soft. This renders inside the inventory page, which works
 * without it; a failed transfer read must not take that screen down.
 */

import { listTransfers } from '@/lib/inventory/transfers-read'

const TENANT = 'tenant-1'
const NORTH = 'o-north'
const SOUTH = 'o-south'

const from = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))

const ROW = {
  id: 'xfer-1',
  status: 'sent',
  from_outlet_id: NORTH,
  to_outlet_id: SOUTH,
  created_at: '2026-07-30T01:00:00.000Z',
  note: null,
  stock_transfer_lines: [
    {
      inventory_item_id: 'item-flour',
      sent_quantity: '500.0000',
      received_quantity: null,
      inventory_items: { name: 'Flour', stock_unit: 'g' },
    },
  ],
}

function stub(result: { data?: unknown; error?: unknown }) {
  from.mockImplementation(() => {
    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: result.data ?? null, error: result.error ?? null }),
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
    }
    return chain
  })
}

beforeEach(() => {
  from.mockReset()
})

describe('listTransfers', () => {
  it('carries the ingredient name onto every line', async () => {
    stub({ data: [ROW] })

    const transfers = await listTransfers(TENANT)

    expect(transfers[0].lines).toEqual([
      expect.objectContaining({
        inventoryItemId: 'item-flour',
        name: 'Flour',
        unit: 'g',
        sentQuantity: 500,
      }),
    ])
  })

  it('reads the quantities as numbers', async () => {
    // NUMERIC arrives as a string; comparing a string to a sent quantity would
    // report every clean transfer as short.
    stub({ data: [ROW] })

    const [transfer] = await listTransfers(TENANT)

    expect(typeof transfer.lines[0].sentQuantity).toBe('number')
  })

  it('keeps an uncounted line uncounted rather than calling it zero', async () => {
    // Zero would read as "nothing arrived" on a delivery nobody has looked at.
    stub({ data: [ROW] })

    const [transfer] = await listTransfers(TENANT)

    expect(transfer.lines[0].receivedQuantity).toBeNull()
  })

  it('returns nothing rather than throwing when the read fails', async () => {
    stub({ error: { message: 'boom' } })

    await expect(listTransfers(TENANT)).resolves.toEqual([])
  })

  it('returns nothing when the tenant has never transferred anything', async () => {
    stub({ data: [] })

    await expect(listTransfers(TENANT)).resolves.toEqual([])
  })

  it('survives a transfer whose lines came back empty', async () => {
    stub({ data: [{ ...ROW, stock_transfer_lines: null }] })

    const [transfer] = await listTransfers(TENANT)

    expect(transfer.lines).toEqual([])
  })
})
