import { requestSync, setSyncClient } from '../../../webnegosyo-desktop/src/renderer/src/lib/sync-engine'

const mockSetError = jest.fn()
jest.mock('../../../webnegosyo-desktop/src/renderer/src/stores/sync-store', () => ({
  useSyncStore: { getState: () => ({ setSyncing: jest.fn(), setPendingCount: jest.fn(), setOnline: jest.fn(), setLastSynced: jest.fn(), setLastError: mockSetError }) },
}))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

it('never replays another store or deployment, or unscoped legacy sales', async () => {
  const orders = [
    { clientOrderId: 'mine', tenantId: 't1', convexUrl: 'https://one.convex.cloud' },
    { clientOrderId: 'other', tenantId: 't2', convexUrl: 'https://two.convex.cloud' },
    { clientOrderId: 'moved', tenantId: 't1', convexUrl: 'https://old.convex.cloud' },
    { clientOrderId: 'legacy' },
  ].map((order) => ({ ...order, payload: { clientOrderId: order.clientOrderId }, paymentStatus: 'paid' }))
  const api = { getPendingPosOrders: jest.fn().mockResolvedValue(orders), markPosOrderSynced: jest.fn().mockResolvedValue(undefined), getPosPendingCount: jest.fn().mockResolvedValue(3), markPosOrderFailed: jest.fn().mockResolvedValue(undefined) }
  Object.assign(window, { api })
  const client = { mutation: jest.fn().mockResolvedValue('server') }
  // The worker is tested at its public entry points against an IPC boundary.
  setSyncClient(client as never, { tenantId: 't1', convexUrl: 'https://one.convex.cloud' })
  requestSync()
  await flush()
  expect(api.markPosOrderSynced.mock.calls).toEqual([['mine', 'server']])
  expect(mockSetError).toHaveBeenCalledWith(expect.stringContaining('reconciliation'))
  setSyncClient(null)
})

it('stops an in-flight run when the active store changes', async () => {
  const scope = { tenantId: 't1', convexUrl: 'https://one.convex.cloud' }
  const order = { ...scope, clientOrderId: 'mine', payload: { clientOrderId: 'mine' }, paymentStatus: 'paid' }
  const api = { getPendingPosOrders: jest.fn().mockResolvedValue([order]), markPosOrderSynced: jest.fn(), getPosPendingCount: jest.fn().mockResolvedValue(1), markPosOrderFailed: jest.fn() }
  Object.assign(window, { api })
  const client = { mutation: jest.fn().mockImplementation(async () => { setSyncClient(null); return 'server' }) }
  setSyncClient(client as never, scope)
  requestSync()
  await flush()
  expect(client.mutation).toHaveBeenCalledTimes(1)
  expect(api.markPosOrderSynced).not.toHaveBeenCalled()
  expect(api.markPosOrderFailed).not.toHaveBeenCalled()
})
