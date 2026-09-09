/**
 * Qualification and earning: which programs an order earns on, how much, and
 * how a threshold crossing carries over.
 */
import { qualifyOrderForProgram } from '@/lib/loyalty/qualify'
import { computeEarnDelta, planEarning, settleThreshold } from '@/lib/loyalty/earn'
import type { LoyaltyProgram } from '@/lib/loyalty/types'
import type { CustomerOrderFact } from '@/lib/customer-order-facts'


function program(overrides: Partial<LoyaltyProgram> = {}): LoyaltyProgram {
  return {
    id: 'prog-1',
    tenantId: 'tenant-1',
    name: 'Coffee card',
    scope: 'business',
    outletId: null,
    status: 'active',
    activatesAt: '2026-09-01T00:00:00.000Z',
    endsAt: null,
    version: {
      id: 'ver-1',
      version: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      rules: {
        earnMode: 'stamp',
        threshold: 10,
        minSpend: null,
        pointsPerPeso: null,
        reward: { type: 'free_item', menuItemId: 'item-1', itemName: 'Latte' },
        rewardExpiryDays: 30,
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

describe('qualifyOrderForProgram', () => {
  it('qualifies a completed, identified order on an active business-wide program', () => {
    expect(qualifyOrderForProgram(program(), fact())).toEqual({ isQualified: true })
  })

  it.each([
    ['a draft program', program({ status: 'draft' }), fact(), 'program_not_active'],
    ['a paused program', program({ status: 'paused' }), fact(), 'program_not_active'],
    ['an anonymous order', program(), fact({ phoneE164: null }), 'anonymous'],
    ['an order still in progress', program(), fact({ status: 'preparing', completedAt: null }), 'not_completed'],
    ['a cancelled order', program(), fact({ status: 'cancelled', completedAt: null }), 'not_completed'],
    ['an order completed before activation', program({ activatesAt: '2026-09-04T12:00:00.000Z' }), fact(), 'before_activation'],
    ['an order completed after the end', program({ endsAt: '2026-09-04T10:30:00.000Z' }), fact(), 'after_end'],
    ['a branch program at another branch', program({ scope: 'branch', outletId: 'north' }), fact({ branchId: 'south' }), 'wrong_branch'],
    ['a branch program with no branch recorded', program({ scope: 'branch', outletId: 'north' }), fact({ branchId: null }), 'wrong_branch'],
    ['a spend below the minimum', program({ version: { ...program().version, rules: { ...program().version.rules, minSpend: 300 } } }), fact({ netTotal: 250 }), 'below_min_spend'],
  ])('refuses %s', (_label, p, f, reason) => {
    expect(qualifyOrderForProgram(p, f)).toEqual({ isQualified: false, reason })
  })

  it('qualifies a POS sale on settlement even with no delivery status', () => {
    const pos = fact({ source: 'pos', status: 'pending', paymentStatus: 'paid', completedAt: '2026-09-04T11:00:00.000Z' })
    expect(qualifyOrderForProgram(program(), pos)).toEqual({ isQualified: true })
  })
})

describe('computeEarnDelta', () => {
  it('gives one stamp per qualified order regardless of spend', () => {
    expect(computeEarnDelta(program().version.rules, 999)).toBe(1)
  })

  it('gives whole points per peso, rounding down', () => {
    const rules = { ...program().version.rules, earnMode: 'points' as const, pointsPerPeso: 0.5 }
    expect(computeEarnDelta(rules, 251)).toBe(125)
  })

  it('earns nothing on a zero-value order', () => {
    const rules = { ...program().version.rules, earnMode: 'points' as const, pointsPerPeso: 1 }
    expect(computeEarnDelta(rules, 0)).toBe(0)
  })
})

describe('settleThreshold', () => {
  it('carries the remainder over when the threshold is crossed', () => {
    expect(settleThreshold(12, 10)).toEqual({ balance: 2, rewardsToIssue: 1 })
  })

  it('issues two rewards when a single earn crosses twice', () => {
    expect(settleThreshold(21, 10)).toEqual({ balance: 1, rewardsToIssue: 2 })
  })

  it('leaves a negative balance alone: a debt is paid down, not rewarded', () => {
    expect(settleThreshold(-3, 10)).toEqual({ balance: -3, rewardsToIssue: 0 })
  })
})

describe('planEarning', () => {
  it('earns on every eligible program, skipping the ones that refuse', () => {
    const programs = [
      program({ id: 'a' }),
      program({ id: 'b', status: 'paused' }),
      program({ id: 'c', version: { ...program().version, id: 'ver-c', rules: { ...program().version.rules, earnMode: 'points', pointsPerPeso: 2 } } }),
    ]
    const plans = planEarning(programs, fact())
    expect(plans.map((p) => [p.programId, p.delta])).toEqual([
      ['a', 1],
      ['c', 500],
    ])
  })

  it('snapshots the reward terms and computes the expiry from the completion time', () => {
    const [plan] = planEarning([program()], fact())
    expect(plan.rewardTerms.reward).toEqual({ type: 'free_item', menuItemId: 'item-1', itemName: 'Latte' })
    expect(plan.rewardTerms.programName).toBe('Coffee card')
    expect(plan.rewardExpiresAt).toBe('2026-10-04T11:00:00.000Z')
  })

  it('leaves the expiry open when the rules set none', () => {
    const p = program({ version: { ...program().version, rules: { ...program().version.rules, rewardExpiryDays: null } } })
    const [plan] = planEarning([p], fact())
    expect(plan.rewardExpiresAt).toBeNull()
  })

  it('plans nothing for a program that would earn zero', () => {
    const p = program({ version: { ...program().version, rules: { ...program().version.rules, earnMode: 'points', pointsPerPeso: 1 } } })
    expect(planEarning([p], fact({ netTotal: 0.4 }))).toEqual([])
  })
})
