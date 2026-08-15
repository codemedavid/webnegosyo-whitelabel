/**
 * Every best-effort stock wrapper must report its swallowed failure to Sentry.
 *
 * The wrappers exist so a stock write can never cost a customer their order —
 * but swallowing with console-only logging made ledger-vs-reality drift
 * invisible. Each catch now reports through `reportStockFailure` with enough
 * tags (tenant, order, operation, revision) to find the drifted order later,
 * while keeping the never-throw contract these suites already pin down.
 */

import {
  applyOrderStockBestEffort,
  reverseOrderStockBestEffort,
  redepleteOrderStockBestEffort,
  applyOrderRevisionStockBestEffort,
} from '@/lib/inventory/order-stock-service'

const captureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

const ITEMS = [{ menuItemId: 'm1', quantity: 1 }]

beforeEach(() => {
  captureException.mockReset()
  from.mockReset()
  // The database is down for every table — the simplest total failure.
  from.mockImplementation(() => {
    throw new Error('connection refused')
  })
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('best-effort stock wrappers report swallowed failures to Sentry', () => {
  it('applyOrderStockBestEffort tags the depletion failure', async () => {
    await expect(applyOrderStockBestEffort('t1', 'o1', ITEMS)).resolves.toBeUndefined()

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: expect.objectContaining({
        tenantId: 't1',
        orderId: 'o1',
        operation: 'apply_order_stock',
      }),
    })
  })

  it('reverseOrderStockBestEffort tags the restore failure', async () => {
    await expect(reverseOrderStockBestEffort('t1', 'o1')).resolves.toBeUndefined()

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: expect.objectContaining({
        tenantId: 't1',
        orderId: 'o1',
        operation: 'reverse_order_stock',
      }),
    })
  })

  it('redepleteOrderStockBestEffort tags the re-depletion failure', async () => {
    await expect(redepleteOrderStockBestEffort('t1', 'o1')).resolves.toBeUndefined()

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: expect.objectContaining({
        tenantId: 't1',
        orderId: 'o1',
        operation: 'redeplete_order_stock',
      }),
    })
  })

  it('applyOrderRevisionStockBestEffort carries the revision being saved', async () => {
    await expect(
      applyOrderRevisionStockBestEffort('t1', 'o1', 3, ITEMS, []),
    ).resolves.toBeUndefined()

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: expect.objectContaining({
        tenantId: 't1',
        orderId: 'o1',
        revision: '3',
      }),
    })
  })

  it('keeps the never-throw contract: a broken Sentry cannot fail the order', async () => {
    captureException.mockImplementation(() => {
      throw new Error('sentry down')
    })

    await expect(applyOrderStockBestEffort('t1', 'o1', ITEMS)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
