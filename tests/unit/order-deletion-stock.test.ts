/**
 * Deleting an order gives its stock back; restoring it spends the stock again.
 * A cancelled order moves nothing either way, and a stock failure never fails
 * the deletion or the restore.
 */
import { confirmDeletion, restoreDeletion } from '@/lib/order-deletion/service'
import type { StockSettlement, OrderStockEffects } from '@/lib/order-deletion/stock'
import type { ArchivedOrderRef, DeletionRecord, OrderDeletionRepo } from '@/lib/order-deletion/types'

jest.mock('@/lib/inventory/stock-failure-report', () => ({ reportStockFailure: jest.fn() }))
import { reportStockFailure } from '@/lib/inventory/stock-failure-report'

const NOW = new Date('2026-11-07T02:00:00.000Z')
const CALLER = { userId: 'owner-1', email: 'o@example.com', tenantId: 'tenant-1' }
const STORE = { id: 'tenant-1', name: 'Aling Nena', slug: 'aling-nena' }
const CONFIRM = { deletionId: 'd1', password: 'pw', confirmation: 'Aling Nena' }

const archived = (orderId: string, status: string, customerData: unknown = null): ArchivedOrderRef => ({
  orderId, status, customerData,
})

function deletion(overrides: Partial<DeletionRecord> = {}): DeletionRecord {
  return {
    id: 'd1', tenant_id: 'tenant-1', requested_by: 'owner-1', status: 'exported',
    scope: { kind: 'all' }, order_count: 3, order_total: 300,
    exported_at: NOW.toISOString(), export_expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
    deleted_at: null, deleted_order_count: null, purge_after: null, restored_at: null, ...overrides,
  }
}

function setup(rows: ArchivedOrderRef[], record: Partial<DeletionRecord> = {}) {
  const calls: string[] = []
  const repo = {
    findDeletion: jest.fn(async () => deletion(record)),
    countRecentPasswordFailures: jest.fn(async () => 0),
    recordAudit: jest.fn(async () => undefined),
    executeDeletion: jest.fn(async () => { calls.push('execute'); return { deleted: rows.length, skipped: 0, total: 0, purgeAfter: 'x' } }),
    restoreDeletion: jest.fn(async () => { calls.push('restore'); return { restored: rows.length } }),
    listArchivedOrders: jest.fn(async () => { calls.push('list'); return rows }),
  } as unknown as jest.Mocked<OrderDeletionRepo>
  const effects: jest.Mocked<OrderStockEffects> = {
    giveBack: jest.fn<Promise<void>, [string, string, string]>(async () => undefined),
    takeAgain: jest.fn<Promise<void>, [string, string, string]>(async () => undefined),
    releasePresell: jest.fn<Promise<void>, [string, unknown]>(async () => undefined),
  }
  const tasks: Array<() => Promise<void>> = []
  const settlement: StockSettlement = { effects, defer: (task) => { tasks.push(task) } }
  const flush = async () => { for (const task of tasks.splice(0)) await task() }
  return { repo, effects, settlement, flush, calls }
}

const verifyOk = jest.fn(async () => 'ok' as const)

beforeEach(() => jest.clearAllMocks())

describe('confirmDeletion stock', () => {
  test('gives back every non-cancelled order and skips cancelled ones', async () => {
    const { repo, effects, settlement, flush } = setup([
      archived('a', 'delivered'), archived('b', 'cancelled'), archived('c', 'pending'),
    ])

    const result = await confirmDeletion(repo, verifyOk, CALLER, STORE, CONFIRM, NOW, settlement)
    await flush()

    expect(result.deleted).toBe(3)
    expect(effects.giveBack.mock.calls.map((c) => c[1]).sort()).toEqual(['a', 'c'])
    expect(effects.giveBack).toHaveBeenCalledWith('tenant-1', 'a', 'owner-1')
    expect(effects.takeAgain).not.toHaveBeenCalled()
  })

  test('releases a pre-order claim from the archived customer data', async () => {
    const data = { presell_claim_id: 'claim-1' }
    const { repo, effects, settlement, flush } = setup([archived('a', 'delivered', data)])

    await confirmDeletion(repo, verifyOk, CALLER, STORE, CONFIRM, NOW, settlement)
    await flush()

    expect(effects.releasePresell).toHaveBeenCalledWith('tenant-1', data)
  })

  test('reads the archive only after the deletion committed', async () => {
    const { repo, settlement, calls } = setup([archived('a', 'delivered')])
    await confirmDeletion(repo, verifyOk, CALLER, STORE, CONFIRM, NOW, settlement)
    expect(calls).toEqual(['execute', 'list'])
  })

  test('a stock failure is reported and never fails the deletion or the other orders', async () => {
    const { repo, effects, settlement, flush } = setup([archived('a', 'delivered'), archived('b', 'delivered')])
    effects.giveBack.mockRejectedValueOnce(new Error('db down'))

    await expect(confirmDeletion(repo, verifyOk, CALLER, STORE, CONFIRM, NOW, settlement)).resolves.toMatchObject({ deleted: 2 })
    await flush()

    expect(reportStockFailure).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'order_deletion_stock', tenantId: 'tenant-1' }), expect.any(Error))
    expect(effects.giveBack).toHaveBeenCalledTimes(2)
  })

  test('an unreadable archive is reported and the deletion still succeeds', async () => {
    const { repo, effects, settlement, flush } = setup([])
    repo.listArchivedOrders.mockRejectedValueOnce(new Error('boom'))

    await expect(confirmDeletion(repo, verifyOk, CALLER, STORE, CONFIRM, NOW, settlement)).resolves.toMatchObject({ deleted: 0 })
    await flush()

    expect(reportStockFailure).toHaveBeenCalled()
    expect(effects.giveBack).not.toHaveBeenCalled()
  })

  test('touches no stock when no settlement is supplied', async () => {
    const { repo } = setup([archived('a', 'delivered')])
    await confirmDeletion(repo, verifyOk, CALLER, STORE, CONFIRM, NOW)
    expect(repo.listArchivedOrders).not.toHaveBeenCalled()
  })

  test('a refused deletion moves no stock', async () => {
    const { repo, effects, settlement, flush } = setup([archived('a', 'delivered')], { status: 'deleted' })
    await expect(confirmDeletion(repo, verifyOk, CALLER, STORE, CONFIRM, NOW, settlement)).rejects.toMatchObject({ code: 'export_used' })
    await flush()
    expect(effects.giveBack).not.toHaveBeenCalled()
  })
})

describe('restoreDeletion stock', () => {
  const restorable = { status: 'deleted' as const, purge_after: '2026-11-14T00:00:00.000Z' }

  test('reads the archive before restoring, then spends non-cancelled orders again', async () => {
    const { repo, effects, settlement, flush, calls } = setup(
      [archived('a', 'delivered'), archived('b', 'cancelled')], restorable)

    await restoreDeletion(repo, CALLER, 'd1', NOW, settlement)
    await flush()

    expect(calls).toEqual(['list', 'restore'])
    expect(effects.takeAgain.mock.calls).toEqual([['tenant-1', 'a', 'owner-1']])
    expect(effects.giveBack).not.toHaveBeenCalled()
    expect(effects.releasePresell).not.toHaveBeenCalled()
  })

  test('a refused restore (window closed) moves no stock', async () => {
    const { repo, effects, settlement, flush } = setup([archived('a', 'delivered')],
      { status: 'deleted', purge_after: '2026-11-01T00:00:00.000Z' })
    await expect(restoreDeletion(repo, CALLER, 'd1', NOW, settlement)).rejects.toMatchObject({ code: 'recovery_closed' })
    await flush()
    expect(effects.takeAgain).not.toHaveBeenCalled()
  })

  test('a failed re-spend is reported and does not fail the restore', async () => {
    const { repo, effects, settlement, flush } = setup([archived('a', 'delivered')], restorable)
    effects.takeAgain.mockRejectedValueOnce(new Error('db down'))

    await expect(restoreDeletion(repo, CALLER, 'd1', NOW, settlement)).resolves.toEqual({ restored: 1 })
    await flush()

    expect(reportStockFailure).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'order_restore_stock' }), expect.any(Error))
  })
})
