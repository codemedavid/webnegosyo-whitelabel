/**
 * Earning orchestration against fake ports: multi-program earning, replays,
 * reversals, and the shadow flag riding through to every write.
 */
import { earnLoyaltyForFact, type LoyaltyEarningDeps, type LoyaltyLedgerEntryInput } from '@/lib/loyalty/apply'
import { runLoyaltyForOrderWith } from '@/lib/loyalty/lifecycle'
import type { LoyaltyProgram } from '@/lib/loyalty/types'
import type { CustomerOrderFact } from '@/lib/customer-order-facts'

const CTX = { tenantId: 'tenant-1', isShadow: false }

function program(id: string, overrides: Partial<LoyaltyProgram> = {}): LoyaltyProgram {
  return {
    id,
    tenantId: 'tenant-1',
    name: `Program ${id}`,
    scope: 'business',
    outletId: null,
    status: 'active',
    activatesAt: '2026-09-01T00:00:00.000Z',
    endsAt: null,
    version: {
      id: `ver-${id}`,
      version: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      rules: {
        earnMode: 'stamp',
        threshold: 10,
        pointsPerPeso: null,
        minSpend: null,
        reward: { type: 'fixed', amount: 50 },
        rewardExpiryDays: null,
        isExclusive: true,
      },
    },
    ...overrides,
  }
}

function fact(overrides: Partial<CustomerOrderFact> = {}): CustomerOrderFact {
  return {
    backend: 'convex',
    externalOrderId: 'order-1',
    customerId: 'cust-1',
    phoneE164: '+639171234567',
    source: 'online',
    status: 'delivered',
    paymentStatus: 'paid',
    branchId: null,
    netTotal: 250,
    orderedAt: '2026-09-04T10:00:00.000Z',
    completedAt: '2026-09-04T11:00:00.000Z',
    updatedAt: '2026-09-04T11:00:00.000Z',
    items: [],
    ...overrides,
  }
}

function fakeDeps(programs: LoyaltyProgram[], earned: Record<string, number> = {}) {
  const writes: LoyaltyLedgerEntryInput[] = []
  const deps: LoyaltyEarningDeps = {
    loadActivePrograms: async () => programs,
    loadOrderEarns: async () => Object.entries(earned).map(([programId, delta]) => ({
      programId, delta, versionId: `original-${programId}`, customerKey: 'phone:+639171234567', isShadow: true,
    })),
    applyLedgerEntry: async (entry) => {
      writes.push(entry)
      return { applied: true, entitlementsIssued: 0 }
    },
  }
  return { deps, writes }
}

describe('earnLoyaltyForFact', () => {
  it('asks for the rules at completion when an order event arrives late', async () => {
    const loadActivePrograms = jest.fn(async () => [program('a')])
    await earnLoyaltyForFact(fact(), CTX, { ...fakeDeps([]).deps, loadActivePrograms })
    expect(loadActivePrograms).toHaveBeenCalledWith('tenant-1', fact().completedAt)
  })
  it('writes one earn per eligible program under the phone-keyed customer', async () => {
    const { deps, writes } = fakeDeps([program('a'), program('b', { status: 'paused' }), program('c')])
    const outcome = await earnLoyaltyForFact(fact(), CTX, deps)

    expect(outcome.action).toBe('earned')
    expect(writes.map((w) => [w.programId, w.kind, w.delta, w.customerKey])).toEqual([
      ['a', 'earn', 1, 'phone:+639171234567'],
      ['c', 'earn', 1, 'phone:+639171234567'],
    ])
    expect(writes[0].orderBackend).toBe('convex')
    expect(writes[0].externalOrderId).toBe('order-1')
    expect(writes[0].threshold).toBe(10)
  })

  it('reports a replay the database refused as a duplicate, not a failure', async () => {
    const deps: LoyaltyEarningDeps = {
      ...fakeDeps([program('a')]).deps,
      applyLedgerEntry: async () => ({ applied: false, reason: 'duplicate' }),
    }
    const outcome = await earnLoyaltyForFact(fact(), CTX, deps)
    expect(outcome.programs[0]).toMatchObject({ applied: false, isDuplicate: true })
  })

  it('reverses exactly what each program earned when the order is cancelled', async () => {
    const { deps, writes } = fakeDeps([program('a'), program('b')], { a: 1 })
    const outcome = await earnLoyaltyForFact(fact({ status: 'cancelled', completedAt: null }), CTX, deps)

    expect(outcome.action).toBe('reversed')
    expect(writes.map((w) => [w.programId, w.kind, w.delta])).toEqual([['a', 'reverse', -1]])
  })

  it('has nothing to reverse for a cancelled order that never earned', async () => {
    const { deps, writes } = fakeDeps([program('a')])
    const outcome = await earnLoyaltyForFact(fact({ status: 'cancelled', completedAt: null }), CTX, deps)
    expect(outcome).toEqual({ action: 'skipped', reason: 'nothing_to_reverse', programs: [] })
    expect(writes).toEqual([])
  })

  it('reverses a discontinued program even when the order no longer has a phone', async () => {
    const { deps, writes } = fakeDeps([], { retired: 1 })
    const outcome = await earnLoyaltyForFact(fact({ status: 'refunded', phoneE164: null }), CTX, deps)
    expect(outcome.action).toBe('reversed')
    expect(writes).toEqual([expect.objectContaining({ programId: 'retired', delta: -1, customerKey: 'phone:+639171234567', versionId: 'original-retired', isShadow: true, customerId: null })])
  })

  it('skips an anonymous order before touching any program', async () => {
    const loadActivePrograms = jest.fn(async () => [program('a')])
    const outcome = await earnLoyaltyForFact(fact({ phoneE164: null }), CTX, { ...fakeDeps([]).deps, loadActivePrograms })
    expect(outcome).toEqual({ action: 'skipped', reason: 'anonymous', programs: [] })
    expect(loadActivePrograms).not.toHaveBeenCalled()
  })

  it('skips an order still in progress', async () => {
    const { deps, writes } = fakeDeps([program('a')])
    const outcome = await earnLoyaltyForFact(fact({ status: 'preparing', completedAt: null }), CTX, deps)
    expect(outcome.reason).toBe('not_qualified')
    expect(writes).toEqual([])
  })

  it('marks every write as shadow while the tenant is in shadow mode', async () => {
    const { deps, writes } = fakeDeps([program('a')])
    await earnLoyaltyForFact(fact(), { ...CTX, isShadow: true }, deps)
    expect(writes.every((w) => w.isShadow)).toBe(true)
  })
})

describe('runLoyaltyForOrderWith', () => {
  const ref = { tenantId: 'tenant-1', backend: 'convex' as const, externalOrderId: 'order-1' }

  it('does nothing for a tenant without loyalty switched on', async () => {
    const loadFact = jest.fn()
    const result = await runLoyaltyForOrderWith(ref, {
      loadFlags: async () => ({ isEnabled: false, isShadow: true }),
      loadFact,
      earning: fakeDeps([program('a')]).deps,
    })
    expect(result).toEqual({ ran: false, reason: 'disabled' })
    expect(loadFact).not.toHaveBeenCalled()
  })

  it('reports an order the platform has never seen', async () => {
    const result = await runLoyaltyForOrderWith(ref, {
      loadFlags: async () => ({ isEnabled: true, isShadow: false }),
      loadFact: async () => null,
      earning: fakeDeps([program('a')]).deps,
    })
    expect(result).toEqual({ ran: false, reason: 'order_not_found' })
  })

  it('carries the shadow flag from the tenant into the earning', async () => {
    const { deps, writes } = fakeDeps([program('a')])
    const result = await runLoyaltyForOrderWith(ref, {
      loadFlags: async () => ({ isEnabled: true, isShadow: true }),
      loadFact: async () => fact(),
      earning: deps,
    })
    expect(result).toMatchObject({ ran: true, isShadow: true, outcome: { action: 'earned' } })
    expect(writes[0].isShadow).toBe(true)
  })
})

/**
 * Convex→platform history imports left some orders in BOTH `orders` (platform
 * row, `customer_data.convex_order_id`) and `customer_external_orders` (the
 * Convex projection). The earn index is keyed per (backend, order id), so each
 * copy could earn its own stamp for one visit. The platform row wins.
 */
describe('earnLoyaltyForFact with an imported twin', () => {
  const PLATFORM_ID = '22222222-2222-4222-8222-222222222222'

  function twinDeps(
    twin: { ref: { backend: CustomerOrderFact['backend']; externalOrderId: string }; isPrimary: boolean } | null,
    earnsByOrder: Record<string, number> = {},
  ) {
    const { deps, writes } = fakeDeps([program('a')])
    const loadOrderEarns = jest.fn(async (_tenant: string, backend: string, orderId: string) => {
      const delta = earnsByOrder[`${backend}:${orderId}`]
      return delta === undefined ? [] : [{ programId: 'a', delta, versionId: 'ver-a', customerKey: 'phone:+639171234567', isShadow: false }]
    })
    const findImportTwin = jest.fn(async () => twin)
    return { deps: { ...deps, loadOrderEarns, findImportTwin }, writes, findImportTwin }
  }

  it('does not earn on the ledger copy when the platform holds the same order', async () => {
    const { deps, writes } = twinDeps({ ref: { backend: 'platform_supabase', externalOrderId: PLATFORM_ID }, isPrimary: true })

    const outcome = await earnLoyaltyForFact(fact({ backend: 'convex', externalOrderId: 'cx-1' }), CTX, deps)

    expect(outcome).toEqual({ action: 'skipped', reason: 'duplicate', programs: [] })
    expect(writes).toHaveLength(0)
  })

  it('does not earn on the platform row when its Convex copy already earned', async () => {
    const { deps, writes } = twinDeps(
      { ref: { backend: 'convex', externalOrderId: 'cx-1' }, isPrimary: false },
      { 'convex:cx-1': 1 },
    )

    const outcome = await earnLoyaltyForFact(fact({ backend: 'platform_supabase', externalOrderId: PLATFORM_ID }), CTX, deps)

    expect(outcome).toMatchObject({ action: 'skipped', reason: 'duplicate' })
    expect(writes).toHaveLength(0)
  })

  it('earns on the platform row when its Convex copy never earned', async () => {
    const { deps, writes } = twinDeps({ ref: { backend: 'convex', externalOrderId: 'cx-1' }, isPrimary: false })

    const outcome = await earnLoyaltyForFact(fact({ backend: 'platform_supabase', externalOrderId: PLATFORM_ID }), CTX, deps)

    expect(outcome.action).toBe('earned')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ orderBackend: 'platform_supabase', externalOrderId: PLATFORM_ID })
  })

  it('does not look for a twin when the order would not earn anyway', async () => {
    const { deps, findImportTwin } = twinDeps(null)

    await earnLoyaltyForFact(fact({ phoneE164: null }), CTX, deps)

    expect(findImportTwin).not.toHaveBeenCalled()
  })

  it('reverses the stamp the Convex copy earned when the platform row is cancelled', async () => {
    const { deps, writes } = twinDeps(
      { ref: { backend: 'convex', externalOrderId: 'cx-1' }, isPrimary: false },
      { 'convex:cx-1': 1 },
    )

    const outcome = await earnLoyaltyForFact(
      fact({ backend: 'platform_supabase', externalOrderId: PLATFORM_ID, status: 'cancelled' }),
      CTX,
      deps,
    )

    expect(outcome.action).toBe('reversed')
    expect(writes).toEqual([
      expect.objectContaining({ kind: 'reverse', delta: -1, orderBackend: 'convex', externalOrderId: 'cx-1' }),
    ])
  })

  it('earns exactly as before when no import twin exists', async () => {
    const { deps, writes } = twinDeps(null)

    expect((await earnLoyaltyForFact(fact(), CTX, deps)).action).toBe('earned')
    expect(writes).toHaveLength(1)
  })
})
