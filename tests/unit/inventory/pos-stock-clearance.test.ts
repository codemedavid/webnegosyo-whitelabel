import {
  decideStockClearance,
  parseStockClearanceRequest,
  clearedQuantities,
  mayApproveOversell,
  type ClearanceStore,
  type ClearanceCaller,
} from '@/lib/inventory/pos-stock-clearance'
import type { ApproverRecord } from '@/lib/gov-discount-ledger/approval-service'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const OUTLET = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const ORDER = 'cccccccc-0000-4000-8000-000000000001'
const DISH = '11111111-0000-4000-8000-000000000001'
const DISH_2 = '11111111-0000-4000-8000-000000000002'
const MANAGER = '00000000-0000-4000-8000-000000000003'
const CASHIER = '00000000-0000-4000-8000-000000000001'

const account = (overrides: Partial<ApproverRecord> = {}): ApproverRecord => ({
  userId: MANAGER,
  name: 'Lito',
  role: 'admin',
  isOwner: false,
  permissions: ['pos', 'inventory'],
  outletId: null,
  ...overrides,
})

const cashier: ClearanceCaller = {
  userId: CASHIER,
  name: 'Ana',
  account: { userId: CASHIER, name: 'Ana', role: 'admin', isOwner: false, permissions: ['pos'], outletId: OUTLET },
}

function makeStore(overrides: Partial<ClearanceStore> = {}) {
  const inserted: unknown[] = []
  const store: ClearanceStore = {
    readPolicy: jest.fn(async () => 'block' as const),
    judge: jest.fn(async () => []),
    findAccount: jest.fn(async () => account()),
    listAccounts: jest.fn(async () => [account(), account({ userId: 'x', name: 'Cook', permissions: ['kitchen'] })]),
    usersWithPins: jest.fn(async () => new Set([MANAGER])),
    allowPinTry: jest.fn(async () => true),
    verifyPin: jest.fn(async () => 'ok' as const),
    insertClearance: jest.fn(async (row) => {
      inserted.push(row)
      return { id: 'clearance-1' }
    }),
    ...overrides,
  }
  return { store, inserted }
}

const request = (extra: Record<string, unknown> = {}) => {
  const parsed = parseStockClearanceRequest({
    tenantId: TENANT,
    orderId: ORDER,
    outletId: OUTLET,
    lines: [
      { menuItemId: DISH, quantity: 2, optionIds: ['o1'], addonIds: ['o1'] },
      { menuItemId: DISH, quantity: 1 },
      { menuItemId: DISH_2, quantity: 3 },
    ],
    ...extra,
  })
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.value
}

const SHORT = [{ menuItemId: DISH, name: 'Adobo', requested: 3, producible: 1 }]

describe('parseStockClearanceRequest', () => {
  it('accepts a register sale and refuses anything malformed', () => {
    expect(request().lines).toHaveLength(3)
    expect(parseStockClearanceRequest({ tenantId: TENANT, orderId: 'nope', lines: [] }).ok).toBe(false)
    // A sale of custom lines only (nothing stocked) is still cleared, so it can be written.
    expect(parseStockClearanceRequest({ tenantId: TENANT, orderId: ORDER, outletId: null, lines: [] }).ok).toBe(true)
    expect(parseStockClearanceRequest({ tenantId: TENANT, orderId: ORDER, lines: [{ menuItemId: DISH, quantity: 1, extra: 1 }] }).ok).toBe(false)
    expect(parseStockClearanceRequest({ tenantId: TENANT, orderId: ORDER, lines: [{ menuItemId: DISH, quantity: 0 }] }).ok).toBe(false)
    expect(
      parseStockClearanceRequest({ tenantId: TENANT, orderId: ORDER, lines: [{ menuItemId: DISH, quantity: 1 }], approval: { approverUserId: MANAGER, pin: '12a4' } }).ok,
    ).toBe(false)
  })
})

describe('clearedQuantities', () => {
  it('adds up each dish across its lines (what order_items will hold)', () => {
    expect(clearedQuantities(request().lines)).toEqual({ [DISH]: 3, [DISH_2]: 3 })
  })
})

describe('mayApproveOversell', () => {
  it('is the owner or an `inventory` holder who reaches the branch', () => {
    expect(mayApproveOversell(account(), OUTLET)).toBe(true)
    expect(mayApproveOversell(account({ permissions: ['pos'] }), OUTLET)).toBe(false)
    expect(mayApproveOversell(account({ outletId: 'other' }), OUTLET)).toBe(false)
    expect(mayApproveOversell(account({ outletId: OUTLET }), OUTLET)).toBe(true)
    expect(mayApproveOversell(account({ isOwner: true, permissions: [] , outletId: 'other' }), OUTLET)).toBe(true)
    expect(mayApproveOversell(account({ role: 'customer' }), OUTLET)).toBe(false)
  })
})

describe('decideStockClearance', () => {
  it('a warn store needs nothing and writes nothing', async () => {
    const { store, inserted } = makeStore({ readPolicy: jest.fn(async () => 'warn' as const) })
    expect(await decideStockClearance(store, request(), cashier)).toEqual({ ok: true, status: 'not_required' })
    expect(inserted).toEqual([])
    expect(store.judge).not.toHaveBeenCalled()
  })

  it('a sale the shelf covers is cleared, bound to order, branch, cashier and quantities', async () => {
    const { store, inserted } = makeStore()
    expect(await decideStockClearance(store, request(), cashier)).toEqual({ ok: true, status: 'cleared', clearanceId: 'clearance-1' })
    expect(inserted).toEqual([
      {
        tenantId: TENANT,
        outletId: OUTLET,
        orderId: ORDER,
        cashierUserId: CASHIER,
        cashierName: 'Ana',
        approverUserId: null,
        approverName: null,
        quantities: { [DISH]: 3, [DISH_2]: 3 },
        shortfalls: [],
      },
    ])
    expect(store.judge).toHaveBeenCalledWith(TENANT, OUTLET, request().lines)
  })

  it('a short sale without approval asks for a manager and lists who may approve', async () => {
    const { store, inserted } = makeStore({ judge: jest.fn(async () => SHORT) })
    expect(await decideStockClearance(store, request(), cashier)).toEqual({
      ok: false,
      status: 409,
      code: 'needs_manager',
      error: 'Stock does not cover this sale. A manager has to approve it.',
      shortfalls: SHORT,
      approvers: [{ userId: MANAGER, name: 'Lito', hasPin: true }],
    })
    expect(inserted).toEqual([])
    expect(store.verifyPin).not.toHaveBeenCalled()
  })

  it('a cashier who may sell past stock approves her own sale, no PIN', async () => {
    const { store, inserted } = makeStore({ judge: jest.fn(async () => SHORT) })
    const manager: ClearanceCaller = { userId: MANAGER, name: 'Lito', account: account() }
    expect(await decideStockClearance(store, request(), manager)).toEqual({
      ok: true,
      status: 'approved',
      clearanceId: 'clearance-1',
      approverName: 'Lito',
    })
    expect(inserted).toEqual([expect.objectContaining({ cashierUserId: MANAGER, approverUserId: MANAGER, shortfalls: SHORT })])
    expect(store.verifyPin).not.toHaveBeenCalled()
  })

  it('a manager PIN approves a short sale for the cashier', async () => {
    const { store, inserted } = makeStore({ judge: jest.fn(async () => SHORT) })
    const outcome = await decideStockClearance(store, request({ approval: { approverUserId: MANAGER, pin: '4821' } }), cashier)
    expect(outcome).toEqual({ ok: true, status: 'approved', clearanceId: 'clearance-1', approverName: 'Lito' })
    expect(store.allowPinTry).toHaveBeenCalledWith(TENANT, CASHIER, MANAGER)
    expect(store.verifyPin).toHaveBeenCalledWith(MANAGER, TENANT, '4821')
    expect(inserted).toEqual([
      expect.objectContaining({ cashierUserId: CASHIER, approverUserId: MANAGER, approverName: 'Lito', quantities: { [DISH]: 3, [DISH_2]: 3 } }),
    ])
  })

  it.each([
    ['wrong', 400, 'That PIN is not right. Try again.'],
    ['locked', 423, 'Too many wrong tries — this PIN is locked for now. Try again later or ask the owner.'],
    ['no_pin', 400, 'This manager has not set an approval PIN yet.'],
  ] as const)('a %s PIN is refused and nothing is cleared', async (verdict, status, error) => {
    const { store, inserted } = makeStore({ judge: jest.fn(async () => SHORT), verifyPin: jest.fn(async () => verdict) })
    expect(await decideStockClearance(store, request({ approval: { approverUserId: MANAGER, pin: '4821' } }), cashier)).toEqual({
      ok: false,
      status,
      error,
    })
    expect(inserted).toEqual([])
  })

  it('refuses an approver who may not approve here, before any PIN is checked', async () => {
    for (const approver of [null, account({ permissions: ['pos'] }), account({ outletId: 'elsewhere' })]) {
      const { store, inserted } = makeStore({ judge: jest.fn(async () => SHORT), findAccount: jest.fn(async () => approver) })
      expect(await decideStockClearance(store, request({ approval: { approverUserId: MANAGER, pin: '4821' } }), cashier)).toEqual({
        ok: false,
        status: 403,
        error: 'That person cannot approve selling past stock here.',
      })
      expect(store.verifyPin).not.toHaveBeenCalled()
      expect(inserted).toEqual([])
    }
  })

  it('slows down PIN guessing before the database is asked', async () => {
    const { store } = makeStore({ judge: jest.fn(async () => SHORT), allowPinTry: jest.fn(async () => false) })
    expect(await decideStockClearance(store, request({ approval: { approverUserId: MANAGER, pin: '4821' } }), cashier)).toEqual({
      ok: false,
      status: 429,
      error: 'Too many tries. Wait a few minutes and try again.',
    })
    expect(store.verifyPin).not.toHaveBeenCalled()
  })

  it('an approval sent for a sale that turned out to fit is not spent: it is cleared as a fit', async () => {
    const { store, inserted } = makeStore()
    expect(await decideStockClearance(store, request({ approval: { approverUserId: MANAGER, pin: '4821' } }), cashier)).toEqual({
      ok: true,
      status: 'cleared',
      clearanceId: 'clearance-1',
    })
    expect(store.verifyPin).not.toHaveBeenCalled()
    expect(inserted).toEqual([expect.objectContaining({ approverUserId: null, shortfalls: [] })])
  })
})
