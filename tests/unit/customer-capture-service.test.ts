/**
 * Routing a merchant-app sale into the right customer-capture path.
 *
 * There are two, and which one an order needs depends on where the order was
 * written. A platform order lives in `public.orders`, so it links by
 * `orders.customer_id` and the profile recompute reads its own order rows. A
 * Convex or tenant-Supabase order lives in a database the platform cannot
 * query, so its facts are copied into the `customer_external_orders` ledger and
 * the recompute reads that instead.
 *
 * Both already existed and are already tested; nothing here reimplements them.
 * This is the dispatch plus the best-effort contract around it — the register
 * calls this after the money is in the drawer, so a bookkeeping failure must
 * never come back as a failed sale.
 */

import { captureAppOrder, type CaptureDeps } from '@/lib/customer-capture-service'
import type { CustomerCaptureRequest } from '@/lib/customer-capture-request'

const REQUEST: CustomerCaptureRequest = {
  tenantId: 't1',
  backend: 'convex',
  orderId: 'order-1',
  name: 'Maria Santos',
  contact: '09171234567',
  customerData: { phone: '09171234567' },
  total: 250,
  createdAt: '2026-08-03T10:00:00Z',
  channel: 'Dine-in',
  items: [{ name: 'Latte', quantity: 2 }],
}

function stubDeps(overrides: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    capturePlatformOrder: jest.fn().mockResolvedValue('cust-1'),
    captureExternalOrder: jest.fn().mockResolvedValue('cust-1'),
    now: () => '2026-08-03T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('captureAppOrder — dispatch by backend', () => {
  it('links a platform order to its customer through the order row itself', async () => {
    // Arrange
    const deps = stubDeps()

    // Act
    await captureAppOrder({ ...REQUEST, backend: 'platform' }, deps)

    // Assert
    expect(deps.capturePlatformOrder).toHaveBeenCalledWith('t1', {
      orderId: 'order-1',
      name: 'Maria Santos',
      contact: '09171234567',
      customerData: { phone: '09171234567' },
    })
    expect(deps.captureExternalOrder).not.toHaveBeenCalled()
  })

  it('does not pass the caller its own totals for a platform order', async () => {
    // The order is already in `public.orders`, so the recompute reads the real
    // row. Trusting a till's claim about its own money here would let a
    // client rewrite lifetime spend without an order to back it up.
    const deps = stubDeps()

    await captureAppOrder({ ...REQUEST, backend: 'platform' }, deps)

    const [, payload] = (deps.capturePlatformOrder as jest.Mock).mock.calls[0]
    expect(payload).not.toHaveProperty('total')
    expect(payload).not.toHaveProperty('items')
  })

  it.each(['convex', 'tenant_supabase'] as const)(
    'copies a %s order into the external ledger, which the platform can read',
    async (backend) => {
      const deps = stubDeps()

      await captureAppOrder({ ...REQUEST, backend }, deps)

      expect(deps.captureExternalOrder).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({
          backend,
          externalOrderId: 'order-1',
          total: 250,
          channel: 'Dine-in',
          items: [{ name: 'Latte', quantity: 2 }],
        })
      )
      expect(deps.capturePlatformOrder).not.toHaveBeenCalled()
    }
  )
})

describe('captureAppOrder — when the sale happened', () => {
  it('uses the order timestamp the caller reported', async () => {
    const deps = stubDeps()

    await captureAppOrder(REQUEST, deps)

    const [, order] = (deps.captureExternalOrder as jest.Mock).mock.calls[0]
    expect(order.createdAt).toBe('2026-08-03T10:00:00Z')
  })

  it('stamps server time when the caller reported none', async () => {
    // Never a client default: a till with a wrong clock would file the sale in
    // the wrong month of the guest's history, and nothing downstream could tell.
    const deps = stubDeps()

    await captureAppOrder({ ...REQUEST, createdAt: null }, deps)

    const [, order] = (deps.captureExternalOrder as jest.Mock).mock.calls[0]
    expect(order.createdAt).toBe('2026-08-03T12:00:00.000Z')
  })
})

describe('captureAppOrder — best effort', () => {
  it('returns the resolved customer id', async () => {
    await expect(captureAppOrder(REQUEST, stubDeps())).resolves.toBe('cust-1')
  })

  it('returns null for an order that identifies nobody', async () => {
    // A walk-in with no contact details is not a customer. The capture path
    // reports that as null, and it is not an error.
    const deps = stubDeps({ captureExternalOrder: jest.fn().mockResolvedValue(null) })

    await expect(captureAppOrder(REQUEST, deps)).resolves.toBeNull()
  })

  it('swallows a capture failure rather than failing the sale', async () => {
    // By the time this runs the order is written and the customer has paid.
    // A profile that misses one sale is recoverable by backfill; a register
    // that reports a completed sale as failed is not.
    const deps = stubDeps({
      captureExternalOrder: jest.fn().mockRejectedValue(new Error('supabase down')),
    })

    await expect(captureAppOrder(REQUEST, deps)).resolves.toBeNull()
  })

  it('logs a failure with enough context to replay it', async () => {
    // The capture is idempotent, so a logged failure is actionable.
    const deps = stubDeps({
      capturePlatformOrder: jest.fn().mockRejectedValue(new Error('supabase down')),
    })

    await captureAppOrder({ ...REQUEST, backend: 'platform' }, deps)

    const logged = JSON.stringify((console.error as jest.Mock).mock.calls[0])
    expect(logged).toContain('t1')
    expect(logged).toContain('order-1')
  })
})
