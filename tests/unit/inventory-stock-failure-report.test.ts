/**
 * Stock-failure reporting helper.
 *
 * Every order-side stock write is best-effort by design — a stock failure must
 * never cost a customer their order — which means the ONLY place a failure can
 * surface is the report itself. This helper is that surface: console for the
 * server logs, Sentry for the dashboard, and it must never throw, or the
 * best-effort contract it exists to observe would be broken by observing it.
 */

import { reportStockFailure } from '@/lib/inventory/stock-failure-report'

const captureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

beforeEach(() => {
  captureException.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('reportStockFailure', () => {
  it('sends the error to Sentry tagged with tenant, order, and operation', () => {
    // Arrange
    const error = new Error('connection refused')

    // Act
    reportStockFailure(
      { tenantId: 't1', orderId: 'o1', operation: 'apply_order_stock' },
      error,
    )

    // Assert
    expect(captureException).toHaveBeenCalledWith(error, {
      tags: {
        tenantId: 't1',
        orderId: 'o1',
        operation: 'apply_order_stock',
      },
    })
  })

  it('includes the revision tag when one is given', () => {
    reportStockFailure(
      { tenantId: 't1', orderId: 'o1', operation: 'apply_order_stock', revision: 3 },
      new Error('boom'),
    )

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: expect.objectContaining({ revision: '3' }),
    })
  })

  it('still logs to the console — Sentry adds to the log line, never replaces it', () => {
    reportStockFailure(
      { tenantId: 't1', orderId: 'o1', operation: 'reverse_order_stock' },
      new Error('boom'),
    )

    expect(console.error).toHaveBeenCalled()
  })

  it('never throws, even when Sentry itself blows up', () => {
    captureException.mockImplementation(() => {
      throw new Error('sentry down')
    })

    expect(() =>
      reportStockFailure(
        { tenantId: 't1', orderId: 'o1', operation: 'redeplete_order_stock' },
        new Error('boom'),
      ),
    ).not.toThrow()
    // The original failure must still reach the console.
    expect(console.error).toHaveBeenCalled()
  })
})
