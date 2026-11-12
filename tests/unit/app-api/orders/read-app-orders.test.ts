import { appOrderDetailSchema, appOrderPageSchema } from '@/lib/app-contract'
import { readLiveOrder, rowsToRefresh, toLiveOrderState, LIVE_REFRESH_MAX } from '@/lib/app-api/orders/live-status'
import { BAD_CURSOR, getAppOrder, listAppOrders, ORDER_NOT_FOUND, type ReadAppOrdersDeps } from '@/lib/app-api/orders/read-app-orders'
import { CUSTOMER, TENANT, placedRow, silentLog } from './order-fixtures'

jest.mock('server-only', () => ({}))

const SCOPE = { tenantId: TENANT, customerId: CUSTOMER }
const NOW = new Date('2026-11-04T12:00:00.000Z')
const LIVE = { status: 'preparing' as const, paymentStatus: 'paid' as const, estimatedReadyAt: '2026-11-04T12:15:00.000Z', number: '07' }

function deps(overrides: Record<string, unknown> = {}) {
  const index = {
    getCustomerOrder: jest.fn().mockResolvedValue(placedRow()),
    listCustomerOrders: jest.fn().mockResolvedValue({ ok: true, orders: [placedRow()], nextCursor: null }),
    recordStatus: jest.fn().mockResolvedValue(true),
  }
  return { index, readLive: jest.fn().mockResolvedValue(LIVE) as jest.Mock, log: silentLog, now: () => NOW, ...overrides } as { index: typeof index; readLive: jest.Mock; log: typeof silentLog; now: () => Date }
}

const asDeps = (d: ReturnType<typeof deps>) => d as unknown as ReadAppOrdersDeps

beforeEach(() => jest.clearAllMocks())

describe('getAppOrder', () => {
  it('reads only the caller’s own row and answers the live state', async () => {
    // Arrange
    const d = deps()

    // Act
    const outcome = await getAppOrder(SCOPE, 'order-1', asDeps(d))

    // Assert
    expect(d.index.getCustomerOrder).toHaveBeenCalledWith(TENANT, CUSTOMER, 'order-1')
    expect(d.readLive).toHaveBeenCalledWith(TENANT, 'order-1')
    expect(outcome.ok && appOrderDetailSchema.parse(outcome.data)).toMatchObject({ status: 'preparing', paymentStatus: 'paid', estimatedReadyAt: LIVE.estimatedReadyAt })
    expect(d.index.recordStatus).toHaveBeenCalledWith(placedRow().id, 'preparing')
  })

  it('is not found for another customer’s order (the index returns no row)', async () => {
    const d = deps()
    d.index.getCustomerOrder.mockResolvedValue(null)
    expect(await getAppOrder(SCOPE, 'their-order', asDeps(d))).toEqual({ ok: false, code: 'not_found', message: ORDER_NOT_FOUND })
    expect(d.readLive).not.toHaveBeenCalled()
  })

  it('answers from the snapshot with the last status when the live read fails', async () => {
    const d = deps({ readLive: jest.fn().mockResolvedValue(null) })
    d.index.getCustomerOrder.mockResolvedValue(placedRow({ lastStatus: 'confirmed' }))
    const outcome = await getAppOrder(SCOPE, 'order-1', asDeps(d))
    expect(outcome.ok && outcome.data).toMatchObject({ status: 'confirmed', paymentStatus: 'unknown', estimatedReadyAt: null })
    expect(d.index.recordStatus).not.toHaveBeenCalled()
  })

  it('does not rewrite an unchanged status, and survives a failed write', async () => {
    const d = deps()
    d.index.getCustomerOrder.mockResolvedValue(placedRow({ lastStatus: 'preparing' }))
    await getAppOrder(SCOPE, 'order-1', asDeps(d))
    expect(d.index.recordStatus).not.toHaveBeenCalled()

    d.index.getCustomerOrder.mockResolvedValue(placedRow({ lastStatus: 'pending' }))
    d.index.recordStatus.mockRejectedValue(new Error('write failed'))
    expect((await getAppOrder(SCOPE, 'order-1', asDeps(d))).ok).toBe(true)
  })
})

describe('listAppOrders', () => {
  it('pages through the index and refreshes at most five stale, unfinished orders', async () => {
    // Arrange: 7 stale active rows, 1 fresh, 1 delivered.
    const stale = Array.from({ length: 7 }, (_, i) => placedRow({ id: `row-${i}`, orderId: `order-${i}`, lastStatusAt: '2026-11-04T11:00:00.000Z' }))
    const fresh = placedRow({ id: 'row-fresh', orderId: 'order-fresh', lastStatusAt: '2026-11-04T11:59:50.000Z' })
    const done = placedRow({ id: 'row-done', orderId: 'order-done', lastStatus: 'delivered' })
    const d = deps()
    d.index.listCustomerOrders.mockResolvedValue({ ok: true, orders: [...stale, fresh, done], nextCursor: 'next-page' })

    // Act
    const outcome = await listAppOrders(SCOPE, 'cursor-1', asDeps(d))

    // Assert
    expect(d.index.listCustomerOrders).toHaveBeenCalledWith(TENANT, CUSTOMER, { cursor: 'cursor-1' })
    expect(d.readLive).toHaveBeenCalledTimes(LIVE_REFRESH_MAX)
    expect(d.readLive.mock.calls.map((call: unknown[]) => call[1])).toEqual(['order-0', 'order-1', 'order-2', 'order-3', 'order-4'])
    const page = outcome.ok ? appOrderPageSchema.parse(outcome.data) : null
    expect(page?.nextCursor).toBe('next-page')
    expect(page?.orders.map((order) => order.status)).toEqual([...Array(5).fill('preparing'), 'pending', 'pending', 'pending', 'delivered'])
  })

  it('a bad cursor is a bad request', async () => {
    const d = deps()
    d.index.listCustomerOrders.mockResolvedValue({ ok: false, error: 'bad_cursor' })
    expect(await listAppOrders(SCOPE, 'garbage', asDeps(d))).toEqual({ ok: false, code: 'bad_request', message: BAD_CURSOR })
  })
})

describe('rowsToRefresh', () => {
  it('skips terminal and recently read rows; a never-read row is stale', () => {
    const rows = [placedRow({ id: 'a', lastStatusAt: null }), placedRow({ id: 'b', lastStatus: 'cancelled', lastStatusAt: null }), placedRow({ id: 'c', lastStatusAt: '2026-11-04T11:59:45.000Z' })]
    expect(rowsToRefresh(rows, NOW).map((row) => row.id)).toEqual(['a'])
  })
})

describe('readLiveOrder', () => {
  const tracking = { status: 'ready', dailyNumber: 7, promisedReadyAt: '2026-11-04T12:10:00.000Z', loyaltyIdentity: { paymentStatus: 'verified' } }
  const base = { fetchTracking: jest.fn(), mintToken: jest.fn().mockReturnValue('tok'), log: silentLog }

  it('reads through the tracking reader with a minted token', async () => {
    base.fetchTracking.mockResolvedValue({ data: tracking, error: null })
    expect(await readLiveOrder(TENANT, 'order-1', base)).toEqual({ status: 'ready', paymentStatus: 'paid', estimatedReadyAt: '2026-11-04T12:10:00.000Z', number: '07' })
    expect(base.mintToken).toHaveBeenCalledWith('order-1')
    expect(base.fetchTracking).toHaveBeenCalledWith('order-1', 'tok', TENANT)
  })

  it.each([
    ['no data', () => base.fetchTracking.mockResolvedValue({ data: null, error: 'Order not found' })],
    ['a throw', () => base.fetchTracking.mockRejectedValue(new Error('boom'))],
    ['a token that cannot be minted', () => base.mintToken.mockImplementationOnce(() => { throw new Error('API_SECRET missing') })],
  ])('is null on %s', async (_label, arrange) => {
    arrange()
    expect(await readLiveOrder(TENANT, 'order-1', base)).toBeNull()
  })

  it('is null when the backend is slower than the timeout', async () => {
    base.fetchTracking.mockReturnValue(new Promise(() => {}))
    expect(await readLiveOrder(TENANT, 'order-1', { ...base, timeoutMs: 10 })).toBeNull()
  })

  it('maps an unknown status to no live state and a bad ready time to null', () => {
    expect(toLiveOrderState({ status: 'teleported' })).toBeNull()
    expect(toLiveOrderState({ status: 'pending', promisedReadyAt: 'soon' })).toEqual({ status: 'pending', paymentStatus: 'unknown', estimatedReadyAt: null, number: null })
  })
})
