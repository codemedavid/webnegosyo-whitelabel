/**
 * @jest-environment node
 */
import {
  DEFAULT_APPROVAL_RULES,
  approverCapCentavos,
  checkCanDecide,
  decideRoute,
  isSameManilaDay,
  mayRequest,
  normalizeRules,
  reachesOutlet,
  toCentavos,
  type RouteInput,
} from '@/lib/approvals/rules'
import type { ApprovalActor, ApprovalKind } from '@/lib/approvals/types'

const rules = { ...DEFAULT_APPROVAL_RULES }
// 2026-10-12 14:00 Manila
const NOW = new Date('2026-10-12T06:00:00Z')
const SAME_DAY_ORDER = new Date('2026-10-12T01:00:00Z') // 09:00 Manila
const YESTERDAY_ORDER = new Date('2026-10-11T15:59:00Z') // 23:59 Manila on the 11th

function actor(overrides: Partial<ApprovalActor> = {}): ApprovalActor {
  return { userId: 'u-staff', role: 'admin', isOwner: false, permissions: ['pos', 'orders'], outletId: null, ...overrides }
}
const owner = actor({ userId: 'u-owner', isOwner: true, permissions: null })
const superadmin = actor({ userId: 'u-super', role: 'superadmin', permissions: null })
const cashier = actor({ userId: 'u-ana', permissions: ['pos'] })
const refunder = actor({ userId: 'u-ria', permissions: ['pos', 'orders', 'order_refund'] })
const manager = actor({ userId: 'u-marco', permissions: ['pos', 'orders', 'approve_requests'] })
const legacyFull = actor({ userId: 'u-legacy', permissions: null })
const cook = actor({ userId: 'u-cook', permissions: ['kitchen'] })
const stockClerk = actor({ userId: 'u-clerk', permissions: ['menu'] })

function route(overrides: Partial<RouteInput>) {
  return decideRoute({ actor: cashier, kind: 'refund', amountCentavos: 18500, rules, now: NOW, orderCreatedAt: SAME_DAY_ORDER, ...overrides })
}

describe('money helpers', () => {
  test('converts pesos to whole centavos without float drift', () => {
    expect(toCentavos(0.1 + 0.2)).toBe(30)
    expect(toCentavos(300)).toBe(30000)
    expect(toCentavos(185.555)).toBe(18556)
  })

  test('compares Manila business days, not UTC days', () => {
    expect(isSameManilaDay(SAME_DAY_ORDER, NOW)).toBe(true)
    expect(isSameManilaDay(YESTERDAY_ORDER, NOW)).toBe(false)
    // 16:30 UTC on the 11th is 00:30 Manila on the 12th
    expect(isSameManilaDay(new Date('2026-10-11T16:30:00Z'), NOW)).toBe(true)
  })
})

describe('approverCapCentavos', () => {
  test('owners and superadmins have no limit', () => {
    expect(approverCapCentavos(owner, rules)).toBeNull()
    expect(approverCapCentavos(superadmin, rules)).toBeNull()
  })
  test('approve_requests holders get the manager cap', () => {
    expect(approverCapCentavos(manager, rules)).toBe(100000)
    expect(approverCapCentavos(manager, { ...rules, managerApproveCap: 2500 })).toBe(250000)
  })
  test('legacy full access does NOT grant approving (opt-in key)', () => {
    expect(approverCapCentavos(legacyFull, rules)).toBe(-1)
    expect(approverCapCentavos(cashier, rules)).toBe(-1)
  })
})

describe('decideRoute — refunds', () => {
  test('owner refunds directly, any amount, any day', () => {
    expect(route({ actor: owner, amountCentavos: 9_999_900, orderCreatedAt: YESTERDAY_ORDER })).toEqual({ route: 'direct' })
  })
  test('order_refund holder refunds directly up to the cap on the same day', () => {
    expect(route({ actor: refunder, amountCentavos: 30000 })).toEqual({ route: 'direct' })
  })
  test('order_refund holder must ask one centavo over the cap', () => {
    expect(route({ actor: refunder, amountCentavos: 30001 })).toEqual({ route: 'request', approverNeeded: 'manager' })
  })
  test('order_refund holder must ask for an order from a previous day', () => {
    expect(route({ actor: refunder, amountCentavos: 100, orderCreatedAt: YESTERDAY_ORDER })).toEqual({
      route: 'request',
      approverNeeded: 'manager',
    })
  })
  test('the "any" window lifts the same-day rule', () => {
    expect(route({ actor: refunder, amountCentavos: 100, orderCreatedAt: YESTERDAY_ORDER, rules: { ...rules, staffRefundWindow: 'any' } }))
      .toEqual({ route: 'direct' })
  })
  test('unknown order time is not "same day"', () => {
    expect(route({ actor: refunder, amountCentavos: 100, orderCreatedAt: null }).route).toBe('request')
  })
  test('approver acts directly up to the manager cap, then asks the owner', () => {
    expect(route({ actor: manager, amountCentavos: 100000 })).toEqual({ route: 'direct' })
    expect(route({ actor: manager, amountCentavos: 100001 })).toEqual({ route: 'request', approverNeeded: 'owner' })
  })
  test('cashier without order_refund always asks; big amounts go to the owner', () => {
    expect(route({ actor: cashier, amountCentavos: 100 })).toEqual({ route: 'request', approverNeeded: 'manager' })
    expect(route({ actor: cashier, amountCentavos: 145000 })).toEqual({ route: 'request', approverNeeded: 'owner' })
  })
  test('someone with no register or order access cannot even ask', () => {
    expect(route({ actor: cook })).toMatchObject({ route: 'refused', code: 'forbidden' })
  })
})

describe('decideRoute — direct limits are cumulative (H2)', () => {
  test('the order cap cannot be split into small refunds', () => {
    expect(route({ actor: refunder, amountCentavos: 10000, orderRefundedCentavos: 20000 })).toEqual({ route: 'direct' })
    expect(route({ actor: refunder, amountCentavos: 10001, orderRefundedCentavos: 20000 }).route).toBe('request')
  })
  test("a person's direct refunds today stop at the manager cap", () => {
    expect(route({ actor: refunder, amountCentavos: 100, requesterDirectTodayCentavos: 99900 })).toEqual({ route: 'direct' })
    expect(route({ actor: refunder, amountCentavos: 101, requesterDirectTodayCentavos: 99900 }).route).toBe('request')
  })
  test("an approver's direct refunds are bounded per ORDER by the manager cap", () => {
    expect(route({ actor: manager, amountCentavos: 50000, orderRefundedCentavos: 50000 })).toEqual({ route: 'direct' })
    expect(route({ actor: manager, amountCentavos: 50001, orderRefundedCentavos: 50000 })).toEqual({ route: 'request', approverNeeded: 'manager' })
  })
  test('the owner is never capped', () => {
    expect(route({ actor: owner, amountCentavos: 1, orderRefundedCentavos: 99_999_999, requesterDirectTodayCentavos: 99_999_999 }))
      .toEqual({ route: 'direct' })
  })
})

describe('decideRoute — cancel paid', () => {
  test('needs orders AND order_refund to act directly', () => {
    const refundOnly = actor({ permissions: ['pos', 'order_refund'] })
    expect(route({ kind: 'cancel_paid', actor: refundOnly, amountCentavos: 100 }).route).toBe('request')
    expect(route({ kind: 'cancel_paid', actor: refunder, amountCentavos: 100 }).route).toBe('direct')
  })
})

describe('decideRoute — discounts', () => {
  test('statutory Senior/PWD discounts are never gated', () => {
    expect(route({ kind: 'discount', isStatutory: true, actor: owner })).toMatchObject({ route: 'refused', code: 'statutory_not_gated' })
  })
  test('at or under the threshold percent is direct for register staff', () => {
    expect(route({ kind: 'discount', discountPct: 20, amountCentavos: 999_999 })).toEqual({ route: 'direct' })
  })
  test('over the threshold asks', () => {
    expect(route({ kind: 'discount', discountPct: 20.01, amountCentavos: 14400 }).route).toBe('request')
  })
  test('missing percent asks', () => {
    expect(route({ kind: 'discount', discountPct: null, amountCentavos: 100 }).route).toBe('request')
  })
})

describe('decideRoute — write-offs', () => {
  test('menu holders write off up to the threshold at cost', () => {
    expect(route({ kind: 'stock_writeoff', actor: stockClerk, amountCentavos: 50000 })).toEqual({ route: 'direct' })
    expect(route({ kind: 'stock_writeoff', actor: stockClerk, amountCentavos: 50001 }).route).toBe('request')
  })
  test('an ingredient with no cost on file is never written off directly (M1)', () => {
    expect(route({ kind: 'stock_writeoff', actor: stockClerk, amountCentavos: 0, isCostUnknown: true }).route).toBe('request')
    expect(route({ kind: 'stock_writeoff', actor: manager, amountCentavos: 0, isCostUnknown: true }).route).toBe('request')
  })
  test('a cashier without menu asks even for a small write-off', () => {
    expect(route({ kind: 'stock_writeoff', actor: cashier, amountCentavos: 100 }).route).toBe('request')
  })
})

describe('mayRequest', () => {
  test.each<[string, ApprovalActor, ApprovalKind, boolean]>([
    ['cashier refund', cashier, 'refund', true],
    ['cook refund', cook, 'refund', false],
    ['clerk write-off', stockClerk, 'stock_writeoff', true],
    ['clerk refund', stockClerk, 'refund', false],
    ['legacy full access', legacyFull, 'cancel_paid', true],
  ])('%s', (_label, who, kind, expected) => {
    expect(mayRequest(who, kind)).toBe(expected)
  })
})

describe('checkCanDecide', () => {
  const base = { requestedBy: 'u-ana', outletId: 'o-makati', amountCentavos: 18500, rules }
  test('a manager approves someone else within limit', () => {
    expect(checkCanDecide({ ...base, approver: manager })).toEqual({ ok: true })
  })
  test('nobody but the owner answers their own request', () => {
    expect(checkCanDecide({ ...base, requestedBy: manager.userId, approver: manager })).toEqual({ ok: false, code: 'self_approval' })
    expect(checkCanDecide({ ...base, requestedBy: owner.userId, approver: owner })).toEqual({ ok: true })
  })
  test('over the manager limit cannot be APPROVED, but can be declined (M6)', () => {
    expect(checkCanDecide({ ...base, amountCentavos: 100001, approver: manager })).toEqual({ ok: false, code: 'over_limit' })
    expect(checkCanDecide({ ...base, decision: 'decline', amountCentavos: 100001, approver: manager })).toEqual({ ok: true })
  })
  test('declining still needs approver rights, reach and someone else', () => {
    expect(checkCanDecide({ ...base, decision: 'decline', approver: refunder })).toEqual({ ok: false, code: 'not_approver' })
    expect(checkCanDecide({ ...base, decision: 'decline', requestedBy: manager.userId, approver: manager })).toEqual({ ok: false, code: 'self_approval' })
  })
  test('a branch-locked manager cannot answer another branch', () => {
    const locked = actor({ userId: 'u-bgc', permissions: ['approve_requests'], outletId: 'o-bgc' })
    expect(checkCanDecide({ ...base, approver: locked })).toEqual({ ok: false, code: 'other_branch' })
    expect(checkCanDecide({ ...base, outletId: null, approver: locked })).toEqual({ ok: false, code: 'other_branch' })
  })
  test('staff without approve_requests cannot answer', () => {
    expect(checkCanDecide({ ...base, approver: refunder })).toEqual({ ok: false, code: 'not_approver' })
  })
})

describe('reachesOutlet', () => {
  test('store-wide accounts and owners reach every branch', () => {
    expect(reachesOutlet(manager, 'o-1')).toBe(true)
    expect(reachesOutlet(actor({ isOwner: true, outletId: 'o-2' }), 'o-1')).toBe(true)
  })
})

describe('normalizeRules', () => {
  test('falls back to defaults field by field', () => {
    expect(normalizeRules({ directRefundCap: '450', staffRefundWindow: 'weird' })).toMatchObject({
      directRefundCap: 450,
      managerApproveCap: 1000,
      staffRefundWindow: 'same_day',
    })
    expect(normalizeRules(null)).toMatchObject({ expiryMinutes: 30, maxPendingPerStaff: 3 })
  })
})
