import { appOrderDetailSchema } from '@/lib/app-contract'
import {
  KEY_CONFLICT,
  LOST_ORDER,
  placeAppOrder,
  SIGNED_OUT,
  STILL_PLACING,
  STORE_UNAVAILABLE,
  type PlaceAppOrderDeps,
  STALE_PLACING_MS,
} from '@/lib/app-api/orders/place-app-order'
import { ORDER_TYPE_GONE, PROOF_NEEDED, REWARDS_SOON } from '@/lib/app-api/orders/order-request'
import type { DraftTenant } from '@/lib/app-api/orders/load-draft'
import type { OrderBackend } from '@/lib/order-backend'
import type { MenuItem } from '@/types/database'
import { CASH, CUSTOMER, DISH, GCASH, KEY, LARGE, PICKUP_TYPE, SIZE_GROUP, TENANT, draft, placedResult, placedRow, silentLog } from './order-fixtures'

jest.mock('server-only', () => ({}))

const CLAIM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DISH_ROW = {
  id: DISH,
  tenant_id: TENANT,
  category_id: 'cat-1',
  name: 'Iced Latte',
  price: 120,
  is_available: true,
  variations: [],
  addons: [],
  variation_types: [{ id: SIZE_GROUP, name: 'Size', is_required: true, options: [{ id: LARGE, name: 'Large', price_modifier: 10 }] }],
} as unknown as MenuItem

function tenant(backend: OrderBackend = 'platform'): DraftTenant {
  return { id: TENANT, row: { id: TENANT }, backend, isLalamove: false, isMultiBranch: false, modifierGroupsEnabled: false }
}

type TestDeps = Omit<PlaceAppOrderDeps, 'index'> & { index: Record<string, jest.Mock> }

function deps(overrides: Partial<PlaceAppOrderDeps> = {}): TestDeps {
  const index = {
    claimOrderKey: jest.fn().mockResolvedValue({ kind: 'claimed', id: CLAIM_ID }),
    markPlaced: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
    reopenFailed: jest.fn().mockResolvedValue(true),
    takeOverStalePlacing: jest.fn().mockResolvedValue(false),
  }
  return {
    index,
    readTenant: jest.fn().mockResolvedValue(tenant()),
    loadDraft: jest.fn().mockResolvedValue({
      ok: true,
      outlet: null,
      input: {
        lines: draft().lines,
        menuItems: new Map([[DISH, DISH_ROW]]),
        categories: [{ id: 'cat-1', is_active: true, default_addons: [] }],
        tenant: { id: TENANT },
        branchIndex: new Map(),
        outletId: null,
      },
    }),
    readOrderTypes: jest.fn().mockResolvedValue([{ id: PICKUP_TYPE, type: 'pickup', name: 'Pick Up', is_enabled: true, available_on_web: true }]),
    readPaymentMethods: jest.fn().mockResolvedValue([
      { id: CASH, name: 'Cash', is_active: true, payment_method_order_types: [{ order_type_id: PICKUP_TYPE }] },
      { id: GCASH, name: 'GCash', is_active: true, require_payment_proof: true, payment_method_order_types: [{ order_type_id: PICKUP_TYPE }] },
    ]),
    readProfile: jest.fn().mockResolvedValue({ name: 'Ana', phoneE164: '+639171234567' }),
    readQuestions: jest.fn().mockResolvedValue([]),
    placeOrder: jest.fn().mockResolvedValue(placedResult()),
    readLive: jest.fn().mockResolvedValue(null),
    log: silentLog,
    ...overrides,
  } as unknown as TestDeps
}

const place = (d: TestDeps, overrides = {}) =>
  placeAppOrder({ tenantId: TENANT, customerId: CUSTOMER, idempotencyKey: KEY, draft: draft(overrides) }, d as unknown as PlaceAppOrderDeps)

beforeEach(() => jest.clearAllMocks())

describe('placeAppOrder — a fresh key', () => {
  it('claims the key on the store backend, places through the engine and records the snapshot', async () => {
    // Arrange
    const d = deps()

    // Act
    const outcome = await place(d)

    // Assert
    expect(d.index.claimOrderKey).toHaveBeenCalledWith({ tenantId: TENANT, appId: TENANT, customerId: CUSTOMER, backend: 'platform', idempotencyKey: KEY })
    const input = (d.placeOrder as jest.Mock).mock.calls[0][0]
    expect(input).toMatchObject({ channel: 'app', clientOrderId: KEY, orderTypeId: PICKUP_TYPE, customerInfo: { contact: '+639171234567' } })
    expect(input.items).toEqual([expect.objectContaining({ menu_item_id: DISH, price: 0, option_ids: [LARGE], variation: 'Large' })])
    expect(d.index.markPlaced).toHaveBeenCalledWith(CLAIM_ID, expect.objectContaining({ orderId: 'order-1', status: 'pending' }))
    const { summary } = d.index.markPlaced.mock.calls[0][1]
    expect(summary).toMatchObject({ number: '07', orderKind: 'pickup', paymentMethodName: 'Cash', lines: [{ selections: { [SIZE_GROUP]: { [LARGE]: 1 } } }] })
    expect(outcome.ok && outcome.status).toBe(201)
    expect(outcome.ok && appOrderDetailSchema.parse(outcome.data)).toMatchObject({ id: 'order-1', status: 'pending', paymentStatus: 'pending', number: '07' })
  })

  it('refuses a reward before claiming anything', async () => {
    const d = deps()
    expect(await place(d, { rewardId: 'r-1' })).toEqual({ ok: false, code: 'refused', message: REWARDS_SOON })
    expect(d.index.claimOrderKey).not.toHaveBeenCalled()
  })

  it('answers unavailable for a store that is gone or switched off', async () => {
    expect(await place(deps({ readTenant: jest.fn().mockResolvedValue(null) }))).toEqual({ ok: false, code: 'unavailable', message: STORE_UNAVAILABLE })
  })

  it.each<[string, Partial<PlaceAppOrderDeps>, object, { code: string; message: string }]>([
    ['a deleted account', { readProfile: jest.fn().mockResolvedValue(null) }, {}, { code: 'unauthorized', message: SIGNED_OUT }],
    ['an order type the store no longer offers', {}, { orderTypeId: 'gone' }, { code: 'refused', message: ORDER_TYPE_GONE }],
    ['a proof method without a reference', {}, { paymentMethodId: GCASH }, { code: 'refused', message: PROOF_NEEDED }],
    ['a branch load-draft refused', { loadDraft: jest.fn().mockResolvedValue({ ok: false, error: 'That branch was not found.' }) }, {}, { code: 'refused', message: 'That branch was not found.' }],
  ])('frees the key and answers for %s', async (_label, override, draftOverride, expected) => {
    const d = deps(override)
    expect(await place(d, draftOverride)).toEqual({ ok: false, ...expected })
    expect(d.index.markFailed).toHaveBeenCalledWith(CLAIM_ID)
    expect(d.placeOrder).not.toHaveBeenCalled()
  })

  it('frees the key when a read throws, then lets the error answer unavailable', async () => {
    const d = deps({ readOrderTypes: jest.fn().mockRejectedValue(new Error('db down')) })
    await expect(place(d)).rejects.toThrow('db down')
    expect(d.index.markFailed).toHaveBeenCalledWith(CLAIM_ID)
  })

  it('answers the store’s own refusal and marks the attempt failed', async () => {
    const d = deps({ placeOrder: jest.fn().mockResolvedValue({ kind: 'refused', error: 'We are closed right now.' }) })
    expect(await place(d)).toEqual({ ok: false, code: 'refused', message: 'We are closed right now.' })
    expect(d.index.markFailed).toHaveBeenCalledWith(CLAIM_ID)
  })

  it('a lost order on platform frees the key (clientOrderId dedupes the retry)', async () => {
    const d = deps({ placeOrder: jest.fn().mockResolvedValue({ kind: 'lost', error: 'boom' }) })
    expect(await place(d)).toEqual({ ok: false, code: 'unavailable', message: LOST_ORDER })
    expect(d.index.markFailed).toHaveBeenCalledWith(CLAIM_ID)
  })

  it.each<[OrderBackend]>([['convex']])('a lost order on %s leaves the key placing (the write may have happened)', async (backend) => {
    const d = deps({ readTenant: jest.fn().mockResolvedValue(tenant(backend)), placeOrder: jest.fn().mockResolvedValue({ kind: 'lost', error: 'boom' }) })
    expect(await place(d)).toEqual({ ok: false, code: 'unavailable', message: LOST_ORDER })
    expect(d.index.claimOrderKey).toHaveBeenCalledWith(expect.objectContaining({ backend }))
    expect(d.index.markFailed).not.toHaveBeenCalled()
  })

  it('still answers the order when the index could not record it', async () => {
    const d = deps()
    d.index.markPlaced.mockResolvedValue(false)
    const outcome = await place(d)
    expect(outcome.ok).toBe(true)
    expect(silentLog.error).toHaveBeenCalledWith('placed order could not be recorded', expect.any(Object))
  })
})

describe('placeAppOrder — a key already held', () => {
  it('a placed key answers the existing order (200) with its live state, never placing again', async () => {
    const d = deps({ readLive: jest.fn().mockResolvedValue({ status: 'ready', paymentStatus: 'paid', estimatedReadyAt: null, number: '07' }) })
    d.index.claimOrderKey.mockResolvedValue({ kind: 'placed', row: placedRow() })
    const outcome = await place(d)
    expect(outcome).toEqual({ ok: true, status: 200, data: expect.objectContaining({ id: 'order-1', status: 'ready', paymentStatus: 'paid' }) })
    expect(d.placeOrder).not.toHaveBeenCalled()
  })

  it('a placing key is still being placed', async () => {
    const d = deps()
    d.index.claimOrderKey.mockResolvedValue({ kind: 'placing', row: placedRow({ state: 'placing' } as never) })
    expect(await place(d)).toEqual({ ok: false, code: 'conflict', message: STILL_PLACING })
    expect(d.placeOrder).not.toHaveBeenCalled()
  })

  it('a platform key stuck placing past the stale window is taken over and finished (the engine dedupes on the key)', async () => {
    const d = deps()
    d.index.claimOrderKey.mockResolvedValue({ kind: 'placing', row: { ...placedRow(), id: CLAIM_ID, state: 'placing' } })
    d.index.takeOverStalePlacing.mockResolvedValue(true)
    const outcome = await place(d)
    expect(d.index.takeOverStalePlacing).toHaveBeenCalledWith(CLAIM_ID, STALE_PLACING_MS)
    expect(d.placeOrder).toHaveBeenCalledWith(expect.objectContaining({ clientOrderId: expect.any(String) }))
    expect(outcome.ok && outcome.status).toBe(201)
  })

  it('a Convex key stuck placing is never re-run — the write may have happened', async () => {
    const d = deps({ readTenant: jest.fn().mockResolvedValue(tenant('convex')) })
    d.index.claimOrderKey.mockResolvedValue({ kind: 'placing', row: { ...placedRow(), id: CLAIM_ID, state: 'placing' } })
    d.index.takeOverStalePlacing.mockResolvedValue(true)
    expect(await place(d)).toEqual({ ok: false, code: 'conflict', message: STILL_PLACING })
    expect(d.index.takeOverStalePlacing).not.toHaveBeenCalled()
    expect(d.placeOrder).not.toHaveBeenCalled()
  })

  it('a failed key is reopened on today’s backend and placed', async () => {
    const d = deps()
    d.index.claimOrderKey.mockResolvedValue({ kind: 'failed', row: { ...placedRow(), id: CLAIM_ID, state: 'failed' } })
    const outcome = await place(d)
    expect(d.index.reopenFailed).toHaveBeenCalledWith(CLAIM_ID, 'platform')
    expect(d.placeOrder).toHaveBeenCalledTimes(1)
    expect(outcome.ok && outcome.status).toBe(201)
  })

  it('a failed key someone else reopened first is still being placed', async () => {
    const d = deps()
    d.index.claimOrderKey.mockResolvedValue({ kind: 'failed', row: { ...placedRow(), id: CLAIM_ID, state: 'failed' } })
    d.index.reopenFailed.mockResolvedValue(false)
    expect(await place(d)).toEqual({ ok: false, code: 'conflict', message: STILL_PLACING })
    expect(d.placeOrder).not.toHaveBeenCalled()
  })

  it('another customer’s key is a bad request', async () => {
    const d = deps()
    d.index.claimOrderKey.mockResolvedValue({ kind: 'conflict' })
    expect(await place(d)).toEqual({ ok: false, code: 'bad_request', message: KEY_CONFLICT })
    expect(d.placeOrder).not.toHaveBeenCalled()
  })
})
