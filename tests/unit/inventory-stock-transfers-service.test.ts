/**
 * The service that performs a transfer.
 *
 * `stock-transfer.ts` decides what should happen; this is what writes it. The
 * things worth pinning here are the ones a pure test cannot see: that the legs
 * reach `stock_movements` rather than being applied to `inventory_stock`
 * directly, that a refusal writes nothing at all, and that the document and the
 * ledger cannot disagree about what was sent.
 */

import {
  createTransfer,
  sendTransfer,
  receiveTransfer,
  cancelTransfer,
} from '@/lib/inventory/stock-transfers-service'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const TENANT = 'tenant-1'
const NORTH = 'o-north'
const SOUTH = 'o-south'
const FLOUR = 'item-flour'
const XFER = 'xfer-1'

const ALL: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: NORTH }
const AT_SOUTH: BranchScope = { kind: 'branch', outletId: SOUTH }

const from = jest.fn()
const scope = jest.fn<Promise<BranchScope>, unknown[]>()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))
jest.mock('@/lib/inventory/acting-branch-scope', () => ({
  resolveActingBranchScope: (...a: unknown[]) => scope(...a),
}))

interface Writes {
  inserts: Array<{ table: string; rows: unknown }>
  updates: Array<{ table: string; patch: unknown }>
}

function stub(options: {
  transfer?: Record<string, unknown> | null
  lines?: Array<Record<string, unknown>>
  items?: Array<Record<string, unknown>>
}): Writes {
  const writes: Writes = { inserts: [], updates: [] }

  const transfer = options.transfer ?? {
    id: XFER,
    tenant_id: TENANT,
    from_outlet_id: NORTH,
    to_outlet_id: SOUTH,
    status: 'draft',
  }
  const lines = options.lines ?? [
    { inventory_item_id: FLOUR, sent_quantity: 10, received_quantity: null, unit_cost: 25 },
  ]
  const items = options.items ?? [{ id: FLOUR, unit_cost: 25 }]

  from.mockImplementation((table: string) => {
    const rows =
      table === 'stock_transfers'
        ? transfer
        : table === 'stock_transfer_lines'
          ? lines
          : items

    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data: rows, error: null }),
      insert: (payload: unknown) => {
        writes.inserts.push({ table, rows: payload })
        return chain
      },
      update: (patch: unknown) => {
        writes.updates.push({ table, patch })
        return chain
      },
    }
    return chain
  })

  return writes
}

beforeEach(() => {
  from.mockReset()
  scope.mockReset()
  scope.mockResolvedValue(ALL)
})

const movementRows = (writes: Writes): Array<Record<string, unknown>> =>
  writes.inserts
    .filter((write) => write.table === 'stock_movements')
    .flatMap((write) => (Array.isArray(write.rows) ? write.rows : [write.rows])) as Array<
    Record<string, unknown>
  >

describe('createTransfer', () => {
  it('freezes the source cost onto each line', async () => {
    // Re-deriving the price at receipt would revalue the chain's stock on a
    // movement that changed nothing but location.
    const writes = stub({ items: [{ id: FLOUR, unit_cost: 25 }] })

    await createTransfer(TENANT, {
      fromOutletId: NORTH,
      toOutletId: SOUTH,
      lines: [{ inventoryItemId: FLOUR, quantity: 10 }],
    })

    const lineWrite = writes.inserts.find((w) => w.table === 'stock_transfer_lines')
    expect(lineWrite?.rows).toEqual([
      expect.objectContaining({ inventory_item_id: FLOUR, sent_quantity: 10, unit_cost: 25 }),
    ])
  })

  it('writes no stock movement — a draft has not moved anything', async () => {
    const writes = stub({})

    await createTransfer(TENANT, {
      fromOutletId: NORTH,
      toOutletId: SOUTH,
      lines: [{ inventoryItemId: FLOUR, quantity: 10 }],
    })

    expect(movementRows(writes)).toHaveLength(0)
  })

  it('refuses a branch drafting a transfer out of another branch', async () => {
    scope.mockResolvedValue(AT_SOUTH)
    const writes = stub({})

    await expect(
      createTransfer(TENANT, {
        fromOutletId: NORTH,
        toOutletId: SOUTH,
        lines: [{ inventoryItemId: FLOUR, quantity: 10 }],
      }),
    ).rejects.toThrow(/own branch/i)

    expect(writes.inserts).toHaveLength(0)
  })
})

describe('sendTransfer', () => {
  it('takes the stock off the sending branch through the ledger', async () => {
    // Through stock_movements, never inventory_stock: the trigger is the single
    // writer of every on-hand figure, and a direct write would leave the ledger
    // unable to explain the number it produced.
    const writes = stub({})

    await sendTransfer(TENANT, XFER)

    expect(movementRows(writes)).toEqual([
      expect.objectContaining({
        tenant_id: TENANT,
        inventory_item_id: FLOUR,
        outlet_id: NORTH,
        reason: 'transfer_out',
        quantity_delta: -10,
        stock_transfer_id: XFER,
      }),
    ])
    expect(writes.inserts.some((w) => w.table === 'inventory_stock')).toBe(false)
  })

  it('marks the document as in transit', async () => {
    const writes = stub({})

    await sendTransfer(TENANT, XFER)

    expect(writes.updates).toContainEqual({
      table: 'stock_transfers',
      patch: expect.objectContaining({ status: 'sent' }),
    })
  })

  it('refuses to send a transfer that has already gone', async () => {
    // A stale tab pressing Send twice would deduct the stock twice.
    const writes = stub({ transfer: { id: XFER, tenant_id: TENANT, from_outlet_id: NORTH, to_outlet_id: SOUTH, status: 'sent' } })

    await expect(sendTransfer(TENANT, XFER)).rejects.toThrow()
    expect(movementRows(writes)).toHaveLength(0)
  })

  it('refuses the destination branch sending its own delivery', async () => {
    scope.mockResolvedValue(AT_SOUTH)
    const writes = stub({})

    await expect(sendTransfer(TENANT, XFER)).rejects.toThrow(/own branch/i)
    expect(movementRows(writes)).toHaveLength(0)
  })
})

describe('receiveTransfer', () => {
  const sent = {
    id: XFER,
    tenant_id: TENANT,
    from_outlet_id: NORTH,
    to_outlet_id: SOUTH,
    status: 'sent',
  }

  it('credits the destination with what actually arrived', async () => {
    scope.mockResolvedValue(AT_SOUTH)
    const writes = stub({ transfer: sent })

    await receiveTransfer(TENANT, XFER, { [FLOUR]: 8 })

    expect(movementRows(writes)).toContainEqual(
      expect.objectContaining({
        outlet_id: SOUTH,
        reason: 'transfer_in',
        quantity_delta: 8,
        stock_transfer_id: XFER,
      }),
    )
  })

  it('charges the shortfall to the sending branch', async () => {
    scope.mockResolvedValue(AT_SOUTH)
    const writes = stub({ transfer: sent })

    await receiveTransfer(TENANT, XFER, { [FLOUR]: 8 })

    expect(movementRows(writes)).toContainEqual(
      expect.objectContaining({ outlet_id: NORTH, reason: 'waste', quantity_delta: -2 }),
    )
  })

  it('records what was counted against the line', async () => {
    scope.mockResolvedValue(AT_SOUTH)
    const writes = stub({ transfer: sent })

    await receiveTransfer(TENANT, XFER, { [FLOUR]: 8 })

    expect(writes.updates).toContainEqual({
      table: 'stock_transfer_lines',
      patch: expect.objectContaining({ received_quantity: 8 }),
    })
  })

  it('refuses the sending branch counting in its own delivery', async () => {
    scope.mockResolvedValue(AT_NORTH)
    const writes = stub({ transfer: sent })

    await expect(receiveTransfer(TENANT, XFER, { [FLOUR]: 8 })).rejects.toThrow(/own branch/i)
    expect(movementRows(writes)).toHaveLength(0)
  })

  it('refuses to receive a transfer that was never sent', async () => {
    const writes = stub({})

    await expect(receiveTransfer(TENANT, XFER, { [FLOUR]: 8 })).rejects.toThrow()
    expect(movementRows(writes)).toHaveLength(0)
  })

  it('refuses a count larger than what was sent, writing nothing', async () => {
    scope.mockResolvedValue(AT_SOUTH)
    const writes = stub({ transfer: sent })

    await expect(receiveTransfer(TENANT, XFER, { [FLOUR]: 12 })).rejects.toThrow(/more than/i)
    expect(movementRows(writes)).toHaveLength(0)
  })
})

describe('cancelTransfer', () => {
  it('cancels a draft without touching stock', async () => {
    const writes = stub({})

    await cancelTransfer(TENANT, XFER)

    expect(writes.updates).toContainEqual({
      table: 'stock_transfers',
      patch: expect.objectContaining({ status: 'cancelled' }),
    })
    expect(movementRows(writes)).toHaveLength(0)
  })

  it('refuses to cancel stock that has already left', async () => {
    // The status flip would not put it back. A lost load is closed by
    // receiving zero, which posts it as shrinkage against the sender.
    const writes = stub({ transfer: { id: XFER, tenant_id: TENANT, from_outlet_id: NORTH, to_outlet_id: SOUTH, status: 'sent' } })

    await expect(cancelTransfer(TENANT, XFER)).rejects.toThrow()
    expect(writes.updates).toHaveLength(0)
  })
})
