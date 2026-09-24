/**
 * The order-deletion flow, against an in-memory repository.
 *
 * The guarantees under test are the ones the owner was promised:
 *   - nothing is deleted without an export of exactly those orders first;
 *   - the store name and the owner's password are both checked, and a typo in
 *     the name never spends a password attempt;
 *   - the database call receives only the deletion id and the verified actor,
 *     never a tenant or order list from the request.
 */
import {
  confirmDeletion,
  prepareExport,
  previewDeletion,
  restoreDeletion,
  OrderDeletionError,
} from '@/lib/order-deletion/service'
import type {
  DeletionRecord,
  ExportItem,
  ExportOrder,
  OrderDeletionRepo,
} from '@/lib/order-deletion/types'
import { EXPORT_TTL_MINUTES, MAX_ORDERS_PER_DELETION, MAX_PASSWORD_FAILURES } from '@/lib/order-deletion/constants'

const NOW = new Date('2026-09-24T02:00:00.000Z')
const CALLER = { userId: 'owner-1', email: 'owner@example.com', tenantId: 'tenant-1' }
const STORE = { id: 'tenant-1', name: 'Aling Nena', slug: 'aling-nena' }

function order(id: string, overrides: Partial<ExportOrder> = {}): ExportOrder {
  return {
    id,
    created_at: '2026-09-01T02:30:00.000Z',
    updated_at: '2026-09-01T03:00:00.000Z',
    daily_number: 1,
    status: 'delivered',
    payment_status: 'paid',
    payment_method_name: 'Cash',
    order_type: 'Pickup',
    outlet_id: null,
    customer_name: 'Guest',
    customer_contact: null,
    delivery_fee: 0,
    service_charge_amount: 0,
    discount_total: 0,
    total: 100,
    amount_paid: 100,
    source: 'web',
    ...overrides,
  }
}

function deletion(overrides: Partial<DeletionRecord> = {}): DeletionRecord {
  return {
    id: 'deletion-1',
    tenant_id: 'tenant-1',
    requested_by: 'owner-1',
    status: 'exported',
    scope: { kind: 'all' },
    order_count: 2,
    order_total: 200,
    exported_at: NOW.toISOString(),
    export_expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
    deleted_at: null,
    deleted_order_count: null,
    purge_after: null,
    restored_at: null,
    ...overrides,
  }
}

function fakeRepo(overrides: Partial<OrderDeletionRepo> = {}) {
  const repo: jest.Mocked<OrderDeletionRepo> = {
    findOrdersForScope: jest.fn(async () => [order('o1'), order('o2', { total: 250 })]),
    findItems: jest.fn(async (): Promise<ExportItem[]> => []),
    findOutletNames: jest.fn(async () => new Map<string, string>()),
    insertDeletion: jest.fn(async () => ({ id: 'deletion-1' })),
    findDeletion: jest.fn(async () => deletion()),
    listDeletions: jest.fn(async () => []),
    recordAudit: jest.fn(async () => undefined),
    countRecentPasswordFailures: jest.fn(async () => 0),
    executeDeletion: jest.fn(async () => ({ deleted: 2, skipped: 0, total: 350, purgeAfter: '2026-10-01T02:00:00.000Z' })),
    restoreDeletion: jest.fn(async () => ({ restored: 2 })),
    ...overrides,
  } as jest.Mocked<OrderDeletionRepo>
  return repo
}

describe('previewDeletion', () => {
  test('counts the orders, their total and how many are still in progress', async () => {
    const repo = fakeRepo({
      findOrdersForScope: jest.fn(async () => [order('o1'), order('o2', { status: 'preparing', total: 50 })]),
    })

    const preview = await previewDeletion(repo, CALLER, { scope: { kind: 'all' }, includeActive: true })

    expect(preview).toMatchObject({ orderCount: 2, orderTotal: 150, activeCount: 1 })
    expect(repo.findOrdersForScope).toHaveBeenCalledWith('tenant-1', { kind: 'all' }, true)
  })
})

describe('prepareExport', () => {
  test('records exactly the exported order ids against the caller and store', async () => {
    const repo = fakeRepo()

    const result = await prepareExport(repo, CALLER, STORE, { scope: { kind: 'all' }, includeActive: false }, NOW)

    expect(repo.insertDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        requested_by: 'owner-1',
        order_ids: ['o1', 'o2'],
        order_count: 2,
        order_total: 350,
        include_active: false,
        exported_at: NOW.toISOString(),
        export_expires_at: new Date(NOW.getTime() + EXPORT_TTL_MINUTES * 60_000).toISOString(),
        export_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    )
    expect(result.deletionId).toBe('deletion-1')
    expect(result.fileName).toBe('aling-nena-orders-backup-2026-09-24.csv')
    expect(result.csv).toContain('o1')
    expect(result.csv).toContain('o2')
    expect(repo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'exported', tenant_id: 'tenant-1', actor_id: 'owner-1', deletion_id: 'deletion-1' })
    )
  })

  test('refuses when nothing matches', async () => {
    const repo = fakeRepo({ findOrdersForScope: jest.fn(async () => []) })

    await expect(
      prepareExport(repo, CALLER, STORE, { scope: { kind: 'all' }, includeActive: false }, NOW)
    ).rejects.toMatchObject({ code: 'nothing_to_delete' })
    expect(repo.insertDeletion).not.toHaveBeenCalled()
  })

  test('refuses more orders than one deletion may take', async () => {
    const many = Array.from({ length: MAX_ORDERS_PER_DELETION + 1 }, (_, i) => order(`o${i}`))
    const repo = fakeRepo({ findOrdersForScope: jest.fn(async () => many) })

    await expect(
      prepareExport(repo, CALLER, STORE, { scope: { kind: 'all' }, includeActive: false }, NOW)
    ).rejects.toMatchObject({ code: 'too_many_orders' })
    expect(repo.insertDeletion).not.toHaveBeenCalled()
  })
})

describe('confirmDeletion', () => {
  const input = { deletionId: 'deletion-1', password: 'secret', confirmation: 'aling nena' }

  test('deletes when the export is pending, the name matches and the password is right', async () => {
    const repo = fakeRepo()
    const verifyPassword = jest.fn(async () => 'ok' as const)

    const result = await confirmDeletion(repo, verifyPassword, CALLER, STORE, input, NOW)

    expect(verifyPassword).toHaveBeenCalledWith('owner@example.com', 'secret', 'owner-1')
    expect(repo.executeDeletion).toHaveBeenCalledWith('deletion-1', 'owner-1')
    expect(result).toEqual({ deleted: 2, skipped: 0, total: 350, purgeAfter: '2026-10-01T02:00:00.000Z' })
  })

  test('looks the deletion up inside the caller’s own store only', async () => {
    const repo = fakeRepo({ findDeletion: jest.fn(async () => null) })

    await expect(
      confirmDeletion(repo, jest.fn(), CALLER, STORE, input, NOW)
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(repo.findDeletion).toHaveBeenCalledWith('deletion-1', 'tenant-1')
    expect(repo.executeDeletion).not.toHaveBeenCalled()
  })

  test("refuses another person's export, even in the same store", async () => {
    const repo = fakeRepo({ findDeletion: jest.fn(async () => deletion({ requested_by: 'someone-else' })) })

    await expect(
      confirmDeletion(repo, jest.fn(), CALLER, STORE, input, NOW)
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(repo.executeDeletion).not.toHaveBeenCalled()
  })

  test('refuses an export that has already been used', async () => {
    const repo = fakeRepo({ findDeletion: jest.fn(async () => deletion({ status: 'deleted' })) })

    await expect(
      confirmDeletion(repo, jest.fn(), CALLER, STORE, input, NOW)
    ).rejects.toMatchObject({ code: 'export_used' })
  })

  test('refuses an expired export and asks for a fresh one', async () => {
    const repo = fakeRepo({
      findDeletion: jest.fn(async () =>
        deletion({ export_expires_at: new Date(NOW.getTime() - 1).toISOString() })
      ),
    })

    await expect(
      confirmDeletion(repo, jest.fn(), CALLER, STORE, input, NOW)
    ).rejects.toMatchObject({ code: 'export_expired' })
    expect(repo.executeDeletion).not.toHaveBeenCalled()
  })

  test('a wrong store name never spends a password attempt', async () => {
    const repo = fakeRepo()
    const verifyPassword = jest.fn()

    await expect(
      confirmDeletion(repo, verifyPassword, CALLER, STORE, { ...input, confirmation: 'delete' }, NOW)
    ).rejects.toMatchObject({ code: 'confirmation_mismatch' })
    expect(verifyPassword).not.toHaveBeenCalled()
    expect(repo.executeDeletion).not.toHaveBeenCalled()
  })

  test('a wrong password is audited and deletes nothing', async () => {
    const repo = fakeRepo()
    const verifyPassword = jest.fn(async () => 'wrong' as const)

    await expect(
      confirmDeletion(repo, verifyPassword, CALLER, STORE, input, NOW)
    ).rejects.toMatchObject({ code: 'wrong_password' })
    expect(repo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'password_failed', actor_id: 'owner-1', tenant_id: 'tenant-1' })
    )
    expect(repo.executeDeletion).not.toHaveBeenCalled()
  })

  test('locks out after too many wrong passwords without checking another', async () => {
    const repo = fakeRepo({ countRecentPasswordFailures: jest.fn(async () => MAX_PASSWORD_FAILURES) })
    const verifyPassword = jest.fn()

    await expect(
      confirmDeletion(repo, verifyPassword, CALLER, STORE, input, NOW)
    ).rejects.toMatchObject({ code: 'too_many_attempts' })
    expect(verifyPassword).not.toHaveBeenCalled()
  })
})

describe('restoreDeletion', () => {
  test('restores a deletion still inside its recovery window', async () => {
    const repo = fakeRepo({
      findDeletion: jest.fn(async () =>
        deletion({ status: 'deleted', purge_after: new Date(NOW.getTime() + 60_000).toISOString() })
      ),
    })

    await expect(restoreDeletion(repo, CALLER, 'deletion-1', NOW)).resolves.toEqual({ restored: 2 })
    expect(repo.restoreDeletion).toHaveBeenCalledWith('deletion-1', 'owner-1')
  })

  test('refuses once the window has closed', async () => {
    const repo = fakeRepo({
      findDeletion: jest.fn(async () =>
        deletion({ status: 'deleted', purge_after: new Date(NOW.getTime() - 1).toISOString() })
      ),
    })

    await expect(restoreDeletion(repo, CALLER, 'deletion-1', NOW)).rejects.toMatchObject({
      code: 'recovery_closed',
    })
    expect(repo.restoreDeletion).not.toHaveBeenCalled()
  })

  test('refuses a deletion that is not deleted', async () => {
    const repo = fakeRepo()
    await expect(restoreDeletion(repo, CALLER, 'deletion-1', NOW)).rejects.toBeInstanceOf(OrderDeletionError)
  })
})
