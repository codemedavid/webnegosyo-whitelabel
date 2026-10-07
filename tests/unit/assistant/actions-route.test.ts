/** @jest-environment node */
/**
 * The Confirm tap: only the proposer, only with the permission, only once.
 */
import { NextRequest } from 'next/server'

jest.mock('server-only', () => ({}))
const mockAccess = jest.fn()
jest.mock('@/lib/assistant/access', () => ({ resolveAssistantAccess: (...a: unknown[]) => mockAccess(...a) }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 5, retryAfterSec: 0 }) }))
const mockStore = { loadAction: jest.fn(), moveAction: jest.fn(), finishAction: jest.fn() }
jest.mock('@/lib/assistant/actions/store', () => ({
  loadAction: (...a: unknown[]) => mockStore.loadAction(...a),
  moveAction: (...a: unknown[]) => mockStore.moveAction(...a),
  finishAction: (...a: unknown[]) => mockStore.finishAction(...a),
}))
const mockExecute = jest.fn()
jest.mock('@/lib/assistant/actions/execute', () => ({ executeAction: (...a: unknown[]) => mockExecute(...a) }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ACTION = '44444444-4444-4444-8444-444444444444'

function action(overrides: Record<string, unknown> = {}) {
  return { id: ACTION, tenantId: TENANT, conversationId: null, createdBy: 'owner', kind: 'menu_item', payload: {}, summary: 's', status: 'pending', expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides }
}

function call(decision: 'confirm' | 'cancel') {
  return import('@/app/api/assistant/actions/[id]/route').then(({ POST }) =>
    POST(new NextRequest(`https://example.test/api/assistant/actions/${ACTION}`, { method: 'POST', body: JSON.stringify({ tenantId: TENANT, decision }) }), {
      params: Promise.resolve({ id: ACTION }),
    }),
  )
}

beforeEach(() => {
  mockAccess.mockReset().mockResolvedValue({
    ok: true,
    caller: { userId: 'owner', role: 'admin', is_owner: true, permissions: null },
    store: { id: TENANT, slug: 'seacook', name: 'SeaCook' },
    flags: {},
  })
  Object.values(mockStore).forEach((fn) => fn.mockReset())
  mockStore.loadAction.mockResolvedValue(action())
  mockStore.moveAction.mockResolvedValue(true)
  mockExecute.mockReset().mockResolvedValue({ ok: true, message: 'Sisig was added to your menu.', resultRef: 'x', link: { label: 'Open menu', path: '/menu' } })
})

test('confirming runs the stored proposal once and records it as applied', async () => {
  const response = await call('confirm')

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'applied', message: 'Sisig was added to your menu.' })
  expect(mockStore.moveAction).toHaveBeenCalledWith(TENANT, ACTION, 'executing', 'owner')
  expect(mockExecute).toHaveBeenCalledTimes(1)
  expect(mockStore.finishAction).toHaveBeenCalledWith(TENANT, ACTION, { status: 'applied', resultRef: 'x' })
})

test('a second tap finds it already handled and changes nothing', async () => {
  mockStore.moveAction.mockResolvedValue(false)
  mockStore.loadAction.mockResolvedValue(action({ status: 'applied' }))

  const response = await call('confirm')

  expect(response.status).toBe(409)
  expect(mockExecute).not.toHaveBeenCalled()
})

test('an expired proposal says so and is not run', async () => {
  mockStore.moveAction.mockResolvedValue(false)
  mockStore.loadAction.mockResolvedValue(action({ expiresAt: new Date(Date.now() - 1000).toISOString() }))

  const response = await call('confirm')

  expect(await response.json()).toMatchObject({ status: 'expired' })
  expect(mockExecute).not.toHaveBeenCalled()
})

test('someone other than the proposer cannot confirm it', async () => {
  mockStore.loadAction.mockResolvedValue(action({ createdBy: 'someone-else' }))

  const response = await call('confirm')

  expect(response.status).toBe(403)
  expect(mockStore.moveAction).not.toHaveBeenCalled()
})

test('staff who lost the permission cannot confirm', async () => {
  mockAccess.mockResolvedValue({
    ok: true,
    caller: { userId: 'owner', role: 'admin', is_owner: false, permissions: ['pos'] },
    store: { id: TENANT, slug: 'seacook', name: 'SeaCook' },
    flags: {},
  })

  const response = await call('confirm')

  expect(response.status).toBe(403)
  expect(mockExecute).not.toHaveBeenCalled()
})

test('a failed write is recorded as failed and reported plainly', async () => {
  mockExecute.mockResolvedValue({ ok: false, error: 'That change could not be made. Nothing was changed.' })

  const body = await (await call('confirm')).json()

  expect(body).toEqual({ status: 'failed', error: 'That change could not be made. Nothing was changed.' })
  expect(mockStore.finishAction).toHaveBeenCalledWith(TENANT, ACTION, { status: 'failed', error: 'That change could not be made. Nothing was changed.' })
})

test('cancelling never executes', async () => {
  const response = await call('cancel')

  expect(await response.json()).toEqual({ status: 'cancelled' })
  expect(mockStore.moveAction).toHaveBeenCalledWith(TENANT, ACTION, 'cancelled', 'owner')
  expect(mockExecute).not.toHaveBeenCalled()
})
