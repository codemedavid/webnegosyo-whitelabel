import { reconcileShadowEarning } from '@/lib/loyalty/shadow'
import type { LoyaltyProgram } from '@/lib/loyalty/types'
import type { CustomerOrderFact } from '@/lib/customer-order-facts'


const PROGRAM: LoyaltyProgram = {
  id: 'p',
  tenantId: 't',
  name: 'Card',
  scope: 'business',
  outletId: null,
  status: 'active',
  activatesAt: '2026-09-01T00:00:00.000Z',
  endsAt: null,
  version: {
    id: 'v',
    version: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    rules: { earnMode: 'stamp', threshold: 10, pointsPerPeso: null, minSpend: null, reward: { type: 'fixed', amount: 50 }, rewardExpiryDays: null, isExclusive: true },
  },
}

function fact(id: string, overrides: Partial<CustomerOrderFact> = {}): CustomerOrderFact {
  return {
    backend: 'convex', externalOrderId: id, customerId: 'c', phoneE164: '+639171234567', source: 'online',
    status: 'delivered', paymentStatus: 'paid', branchId: null, netTotal: 100,
    orderedAt: '2026-09-04T10:00:00.000Z', completedAt: '2026-09-04T11:00:00.000Z', updatedAt: '2026-09-04T11:00:00.000Z', items: [],
    ...overrides,
  }
}

const row = (externalOrderId: string, delta = 1) => ({
  programId: 'p', customerKey: 'phone:+639171234567', kind: 'earn', delta, orderBackend: 'convex', externalOrderId,
})

describe('reconcileShadowEarning', () => {
  it('is clean when the ledger recorded exactly what the engine expects', () => {
    const result = reconcileShadowEarning([fact('o1'), fact('o2')], [PROGRAM], [row('o1'), row('o2')])
    expect(result).toMatchObject({ expectedEntries: 2, recordedEntries: 2, missing: [], unexpected: [] })
  })

  it('flags an order that should have earned but has no row', () => {
    const result = reconcileShadowEarning([fact('o1'), fact('o2')], [PROGRAM], [row('o1')])
    expect(result.missing).toEqual([
      { programId: 'p', customerKey: 'phone:+639171234567', orderBackend: 'convex', externalOrderId: 'o2', delta: 1, recordedDelta: null },
    ])
  })

  it('flags a row recorded with the wrong delta', () => {
    const result = reconcileShadowEarning([fact('o1')], [PROGRAM], [row('o1', 3)])
    expect(result.missing[0]).toMatchObject({ externalOrderId: 'o1', delta: 1, recordedDelta: 3 })
  })

  it('flags a row the engine would not produce, such as one for a cancelled order', () => {
    const result = reconcileShadowEarning([fact('o1', { status: 'cancelled', completedAt: null })], [PROGRAM], [row('o1')])
    expect(result.unexpected).toEqual([row('o1')])
    expect(result.expectedEntries).toBe(0)
  })

  it('ignores reversal rows: only earns are reconciled', () => {
    const reverse = { ...row('o1'), kind: 'reverse', delta: -1 }
    const result = reconcileShadowEarning([fact('o1')], [PROGRAM], [row('o1'), reverse])
    expect(result.unexpected).toEqual([])
    expect(result.recordedEntries).toBe(1)
  })
})
