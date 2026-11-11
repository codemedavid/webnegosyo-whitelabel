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
const rpc = jest.fn()
const mockReportStockFailure = jest.fn()
jest.mock('@/lib/inventory/stock-failure-report', () => ({
  reportStockFailure: (...a: unknown[]) => mockReportStockFailure(...a),
}))
const scope = jest.fn<Promise<BranchScope>, unknown[]>()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({ from: (...a: unknown[]) => from(...a), rpc: (...a: unknown[]) => rpc(...a) }),
}))
jest.mock('@/lib/inventory/acting-branch-scope', () => ({
  resolveActingBranchScope: (...a: unknown[]) => scope(...a),
}))
const mockProcessStockLevelChanges = jest.fn()
jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: (...a: unknown[]) => mockProcessStockLevelChanges(...a),
}))

interface Writes {
  rpcs: Array<{ fn: string; args: Record<string, unknown> }>
  inserts: Array<{ table: string; rows: unknown }>
  updates: Array<{ table: string; patch: unknown }>
}

function stub(options: {
  transfer?: Record<string, unknown> | null
  lines?: Array<Record<string, unknown>>
  items?: Array<Record<string, unknown>>
  /** Row-level security turned the status change away: no error, no rows. */
  updateRefused?: boolean
}): Writes {
  const writes: Writes = { rpcs: [], inserts: [], updates: [] }
  rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    writes.rpcs.push({ fn, args })
    return Promise.resolve({ data: null, error: null })
  })

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
        // What PostgREST answers to the write: the rows it changed.
        const changed = { data: options.updateRefused ? [] : [{ id: XFER }], error: null }
        const written: Record<string, unknown> = {
          eq: () => written,
          select: () => written,
          then: (resolve: (v: unknown) => void) => resolve(changed),
        }
        return written
      },
    }
    return chain
  })

  return writes
}

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  mockReportStockFailure.mockReset()
  mockProcessStockLevelChanges.mockReset()
  scope.mockReset()
  scope.mockResolvedValue(ALL)
})

/** The legs the service handed to the transfer functions. */
const movementRows = (writes: Writes): Array<Record<string, unknown>> =>
  writes.rpcs.flatMap((call) => call.args.p_legs as Array<Record<string, unknown>>)

describe('createTransfer', () => {
  it('writes no price on the lines and never reads what an ingredient costs', async () => {
    // The ledger freezes each leg's cost itself, and unit_cost is not selectable
    // by the session role (20261107130100), so a draft neither reads nor writes one.
    const writes = stub({ items: [{ id: FLOUR, unit_cost: 25 }] })

    await createTransfer(TENANT, {
      fromOutletId: NORTH,
      toOutletId: SOUTH,
      lines: [{ inventoryItemId: FLOUR, quantity: 10 }],
    })

    const lineWrite = writes.inserts.find((w) => w.table === 'stock_transfer_lines')
    expect(lineWrite?.rows).toEqual([expect.not.objectContaining({ unit_cost: expect.anything() })])
    expect(lineWrite?.rows).toEqual([expect.objectContaining({ inventory_item_id: FLOUR, sent_quantity: 10 })])
    expect(from.mock.calls.map(([table]) => table)).not.toContain('inventory_items')
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
        inventory_item_id: FLOUR,
        outlet_id: NORTH,
        reason: 'transfer_out',
        quantity_delta: -10,
      }),
    ])
    expect(writes.inserts.some((w) => w.table === 'inventory_stock')).toBe(false)
  })

  it('sends legs and the status change as ONE database step', async () => {
    // Two requests used to leave the stock moved while the transfer still said
    // draft, and the each-leg-once index then blocked every retry.
    const writes = stub({})

    await sendTransfer(TENANT, XFER)

    expect(writes.rpcs).toEqual([
      { fn: 'send_stock_transfer', args: expect.objectContaining({ p_transfer_id: XFER }) },
    ])
    expect(writes.inserts.some((w) => w.table === 'stock_movements')).toBe(false)
    expect(writes.updates.some((w) => w.table === 'stock_transfers')).toBe(false)
  })

  it('throws, alerts nobody and reports when the step fails, so nothing half-moved is claimed', async () => {
    stub({})
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset', code: '08006' } })

    await expect(sendTransfer(TENANT, XFER)).rejects.toMatchObject({ message: 'connection reset' })

    expect(mockProcessStockLevelChanges).not.toHaveBeenCalled()
    expect(mockReportStockFailure).toHaveBeenCalledWith(
      { tenantId: TENANT, operation: 'stock_transfer_step' },
      expect.objectContaining({ message: 'connection reset' }),
    )
  })

  it('does not report a refusal the merchant can act on (a second tab already sent it)', async () => {
    stub({})
    rpc.mockResolvedValue({ data: null, error: { message: 'A sent transfer cannot be marked sent.', code: '23514' } })

    await expect(sendTransfer(TENANT, XFER)).rejects.toMatchObject({ code: '23514' })

    expect(mockReportStockFailure).not.toHaveBeenCalled()
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
      }),
    )
  })

  it('alerts, 86es and restores per branch the legs touched, like any other movement', async () => {
    // Until 2026-11-03 transfer legs bypassed alerts and auto-86: the branch
    // that just received stock kept its "out" alert and its hidden dishes.
    scope.mockResolvedValue(AT_SOUTH)
    stub({ transfer: sent, items: [{ id: FLOUR, unit_cost: 25, current_qty: 10 }] })

    await receiveTransfer(TENANT, XFER, { [FLOUR]: 8 })

    const calls = mockProcessStockLevelChanges.mock.calls.map(([tenant, , deltas, outlet]) => [tenant, outlet, [...deltas]])
    expect(calls).toEqual(
      expect.arrayContaining([
        [TENANT, SOUTH, [[FLOUR, 8]]],
        // The shortfall goes back on the sender's shelf and is wasted there:
        // net zero, as the sender's stock really is.
        [TENANT, NORTH, [[FLOUR, 0]]],
      ]),
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

  it('records what was counted in the same step as the legs and status', async () => {
    scope.mockResolvedValue(AT_SOUTH)
    const writes = stub({ transfer: sent })

    await receiveTransfer(TENANT, XFER, { [FLOUR]: 8 })

    expect(writes.rpcs).toEqual([
      {
        fn: 'receive_stock_transfer',
        args: expect.objectContaining({ p_transfer_id: XFER, p_counts: { [FLOUR]: 8 } }),
      },
    ])
    expect(writes.updates.some((w) => w.table === 'stock_transfer_lines')).toBe(false)
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

  it('reports a cancel the database refused, instead of saying it was cancelled', async () => {
    // Row-level security refuses silently: no error, zero rows. The transfer
    // is still a draft, so "cancelled" on screen would be untrue.
    stub({ updateRefused: true })

    await expect(cancelTransfer(TENANT, XFER)).rejects.toThrow('Nothing was changed. You may not have access to do this.')
  })
})
