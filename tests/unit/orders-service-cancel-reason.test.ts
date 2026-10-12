/**
 * A platform cancel carries its reason into BOTH records: the orders row
 * (cancel_reason, read by the store_activity orders trigger) and the
 * best-effort order_status_events row. Optional until Phase 2.
 */
import { updateOrderStatus } from '@/lib/orders-service'

const verifyTenantPermission = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
}))
jest.mock('@/lib/inventory/order-stock-service', () => ({
  redepleteOrderStockBestEffort: jest.fn(() => Promise.resolve()),
  reverseOrderStockBestEffort: jest.fn(() => Promise.resolve()),
}))
jest.mock('@/lib/loyverse/push-service', () => ({ pushOrderToLoyverseBestEffort: jest.fn(() => Promise.resolve()) }))
jest.mock('@/lib/loyalty/lifecycle', () => ({ runLoyaltyForOrder: jest.fn(() => Promise.resolve(null)) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const recorded: Array<Record<string, unknown>> = []
jest.mock('@/lib/staff-activity/record-order-event', () => ({
  createSupabaseOrderEventStore: () => ({}),
  recordOrderEventBestEffort: (_store: unknown, draft: Record<string, unknown>) => {
    recorded.push(draft)
    return Promise.resolve()
  },
}))

const patches: Array<Record<string, unknown>> = []
const from = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))

function stubOrders(previous: string) {
  return (table: string) => {
    if (table !== 'orders') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }
    }
    const chain = {
      eq: () => chain,
      select: () => ({ single: () => Promise.resolve({ data: { id: 'o1' }, error: null }) }),
    }
    return {
      select: () => ({
        eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'o1', status: previous }, error: null }) }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        patches.push(patch)
        return chain
      },
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  patches.length = 0
  recorded.length = 0
  verifyTenantPermission.mockResolvedValue({ user: { id: 'u1', email: 'ana@example.com' } })
})

describe('updateOrderStatus cancel reason', () => {
  it('stores the reason on the order and on the status event', async () => {
    from.mockImplementation(stubOrders('confirmed'))

    await updateOrderStatus('o1', 't1', 'cancelled', { reason: '  Customer left ', note: 'Walked out' })

    expect(patches[0]).toEqual({ status: 'cancelled', cancel_reason: 'Customer left' })
    expect(recorded[0]).toMatchObject({ status: 'cancelled', reason: 'Customer left', note: 'Walked out' })
  })

  it('sends no cancel_reason key when no reason was given (pre-migration safe)', async () => {
    from.mockImplementation(stubOrders('confirmed'))

    await updateOrderStatus('o1', 't1', 'cancelled')

    expect(patches[0]).toEqual({ status: 'cancelled' })
    expect(recorded[0].reason).toBeNull()
  })

  it('ignores a reason on a non-cancel move', async () => {
    from.mockImplementation(stubOrders('confirmed'))

    await updateOrderStatus('o1', 't1', 'preparing', { reason: 'Why not' })

    expect(patches[0]).toEqual({ status: 'preparing' })
  })

  it('refuses an over-long reason before touching the order', async () => {
    from.mockImplementation(stubOrders('confirmed'))

    await expect(updateOrderStatus('o1', 't1', 'cancelled', { reason: 'x'.repeat(501) })).rejects.toThrow(/reason/)
    expect(patches).toHaveLength(0)
  })
})
