/**
 * Online-checkout grants are written best-effort; an order that kept its
 * Senior/PWD block but never reached the sales book is found here and can be
 * recorded later from the STORED order (re-priced by the same engine).
 */
import { describe, it, expect } from '@jest/globals'
import { computeGovDiscount, type StoredGovDiscount } from '@/lib/gov-discount'
import {
  findMissingFromBook,
  recordRequestFromOrder,
  type BookOrder,
  type MissingStore,
} from '@/lib/gov-discount-ledger/missing-from-book'

const TENANT = '11111111-1111-4111-8111-111111111111'
const NORTH = '33333333-3333-4333-8333-333333333333'

function government(): StoredGovDiscount {
  const priced = computeGovDiscount({
    vatStatus: 'vat',
    lines: [{ key: 'line-0', name: 'Sisig', quantity: 1, amount: 560, eligible: true }],
    claimants: [
      { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'items', units: { 'line-0': 1 } } },
    ],
  })
  if (!priced.ok) throw new Error('fixture')
  return { version: 1, vatStatus: 'vat', serviceChargeMode: 'full', diners: null, claimants: priced.claimants, vat: null }
}

const order = (overrides: Partial<BookOrder> = {}): BookOrder => ({
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-10-15T04:00:00.000Z',
  status: 'confirmed',
  outletId: null,
  dailyNumber: 7,
  total: 400,
  serviceCharge: 0,
  deliveryFee: 0,
  source: 'online',
  revision: 0,
  government: government(),
  items: [{ menuItemId: 'm1', name: 'Sisig', quantity: 1, subtotal: 560 }],
  ...overrides,
})

function store(orders: BookOrder[], recorded: string[] = []): MissingStore {
  return {
    listDiscountedOrders: async () => orders,
    recordedOrderIds: async (_tenant, ids) => new Set(ids.filter((id) => recorded.includes(id))),
  }
}

const PERIOD = { startIso: '2026-10-01T00:00:00.000Z', endIso: '2026-11-01T00:00:00.000Z' }

describe('findMissingFromBook', () => {
  it('lists orders whose Senior/PWD discount never reached the sales book', async () => {
    const missing = await findMissingFromBook(store([order()]), TENANT, PERIOD, { kind: 'all' })
    expect(missing).toEqual([
      expect.objectContaining({ orderId: order().id, label: '#7', claimantCount: 1, reduction: 160 }),
    ])
  })

  it('skips orders already in the book, cancelled orders, and orders without a claim', async () => {
    const recorded = order()
    const cancelled = order({ id: 'b', status: 'cancelled' })
    const plain = order({ id: 'c', government: null })
    expect(await findMissingFromBook(store([recorded, cancelled, plain], [recorded.id]), TENANT, PERIOD, { kind: 'all' })).toEqual([])
  })

  it("shows a branch reviewer only their branch's orders", async () => {
    const other = order({ id: 'x', outletId: 'south' })
    const mine = order({ id: 'y', outletId: NORTH })
    const missing = await findMissingFromBook(store([other, mine]), TENANT, PERIOD, { kind: 'branch', outletId: NORTH })
    expect(missing.map((row) => row.orderId)).toEqual(['y'])
  })
})

describe('recordRequestFromOrder', () => {
  it('builds the sales-book record from the stored order, lines keyed by position', () => {
    const request = recordRequestFromOrder(TENANT, order())
    expect(request).toMatchObject({
      tenantId: TENANT,
      backend: 'platform_supabase',
      externalOrderId: order().id,
      orderLabel: '#7',
      revision: 0,
      occurredAt: '2026-10-15T04:00:00.000Z',
      source: 'online',
      lines: [{ key: 'line-0', menuItemId: 'm1', name: 'Sisig', quantity: 1, amount: 560 }],
      approvalId: null,
    })
    expect(request?.government?.claimants).toHaveLength(1)
  })

  it('has nothing to record for an order without a claim', () => {
    expect(recordRequestFromOrder(TENANT, order({ government: null }))).toBeNull()
  })
})
