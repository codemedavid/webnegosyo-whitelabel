/**
 * @jest-environment node
 */
import { APPROVAL_TRANSITIONS, canTransition, effectiveStatus, isOpenStatus, isTerminalStatus } from '@/lib/approvals/state'
import { createApprovalSchema, decisionSchema, rulesUpdateSchema } from '@/lib/approvals/schemas'
import { APPROVAL_STATUSES } from '@/lib/approvals/types'
import { DECLINE_REASONS, REASONS_BY_KIND, defaultRestock } from '@/lib/approvals/reasons'
import fs from 'node:fs'
import path from 'node:path'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const ITEM = '33333333-3333-4333-8333-333333333333'

describe('state machine', () => {
  test('only pending can be answered, withdrawn or expire', () => {
    expect(canTransition('pending', 'approved')).toBe(true)
    expect(canTransition('pending', 'executed')).toBe(false)
    expect(canTransition('approved', 'declined')).toBe(false)
    expect(canTransition('executed', 'failed')).toBe(false)
  })
  test('terminal states go nowhere', () => {
    for (const status of APPROVAL_STATUSES) {
      if (isTerminalStatus(status)) expect(APPROVAL_TRANSITIONS[status]).toHaveLength(0)
    }
    expect(isOpenStatus('executing')).toBe(true)
  })
  test('a pending row past its deadline reads as expired before the sweep runs', () => {
    const now = new Date('2026-10-12T06:00:00Z')
    expect(effectiveStatus('pending', '2026-10-12T05:59:59Z', now)).toBe('expired')
    expect(effectiveStatus('pending', '2026-10-12T06:00:01Z', now)).toBe('pending')
    expect(effectiveStatus('declined', '2026-10-12T05:00:00Z', now)).toBe('declined')
  })
  test('the TS transition table equals the SQL one', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261012160000_approvals.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('function public.approval_transition_allowed'))
    const pairs = Array.from(block.slice(0, block.indexOf('$$;')).matchAll(/\('(\w+)', '(\w+)'\)/g)).map((m) => `${m[1]}>${m[2]}`)
    const ts = Object.entries(APPROVAL_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
    expect(new Set(pairs)).toEqual(new Set(ts))
  })
})

describe('createApprovalSchema', () => {
  const base = { tenantId: TENANT, reasonCode: 'wrong_item', idempotencyKey: 'sheet_abc12345' }
  test('accepts an items refund', () => {
    const parsed = createApprovalSchema.safeParse({
      ...base, kind: 'refund', orderId: ORDER, payload: { scope: 'items', lines: [{ orderItemId: ITEM, quantity: 1 }], restock: false },
    })
    expect(parsed.success).toBe(true)
  })
  test('refuses the same line twice', () => {
    const parsed = createApprovalSchema.safeParse({
      ...base, kind: 'refund', orderId: ORDER,
      payload: { scope: 'items', lines: [{ orderItemId: ITEM, quantity: 1 }, { orderItemId: ITEM, quantity: 1 }] },
    })
    expect(parsed.success).toBe(false)
  })
  test('refuses a reason from another kind', () => {
    const parsed = createApprovalSchema.safeParse({ ...base, reasonCode: 'spoiled', kind: 'refund', orderId: ORDER, payload: { scope: 'whole' } })
    expect(parsed.success).toBe(false)
  })
  test('"Other" needs a note', () => {
    const without = createApprovalSchema.safeParse({ ...base, reasonCode: 'other', kind: 'cancel_paid', orderId: ORDER, payload: {} })
    const withNote = createApprovalSchema.safeParse({ ...base, reasonCode: 'other', note: 'Fire alarm', kind: 'cancel_paid', orderId: ORDER, payload: {} })
    expect(without.success).toBe(false)
    expect(withNote.success).toBe(true)
  })
  test('refuses negative and absurd amounts and a short retry key', () => {
    expect(createApprovalSchema.safeParse({ ...base, kind: 'refund', orderId: ORDER, payload: { scope: 'amount', amount: -5 } }).success).toBe(false)
    expect(createApprovalSchema.safeParse({ ...base, kind: 'refund', orderId: ORDER, payload: { scope: 'amount', amount: 2_000_000 } }).success).toBe(false)
    expect(createApprovalSchema.safeParse({ ...base, idempotencyKey: 'x', kind: 'refund', orderId: ORDER, payload: { scope: 'whole' } }).success).toBe(false)
  })
  test('amounts are whole centavos (L4)', () => {
    expect(createApprovalSchema.safeParse({ ...base, kind: 'refund', orderId: ORDER, payload: { scope: 'amount', amount: 185.5 } }).success).toBe(true)
    expect(createApprovalSchema.safeParse({ ...base, kind: 'refund', orderId: ORDER, payload: { scope: 'amount', amount: 0.29 } }).success).toBe(true)
    expect(createApprovalSchema.safeParse({ ...base, kind: 'refund', orderId: ORDER, payload: { scope: 'amount', amount: 185.555 } }).success).toBe(false)
    expect(decisionSchema.safeParse({ tenantId: TENANT, decision: 'approve', amountOverride: 10.001 }).success).toBe(false)
    expect(rulesUpdateSchema.safeParse({ tenantId: TENANT, directRefundCap: 300.005 }).success).toBe(false)
  })
  test('a write-off carries no order', () => {
    const parsed = createApprovalSchema.safeParse({
      ...base, reasonCode: 'spoiled', kind: 'stock_writeoff', payload: { inventoryItemId: ITEM, quantity: 2 },
    })
    expect(parsed.success).toBe(true)
  })
})

describe('decisionSchema', () => {
  test('declining needs a decline reason', () => {
    expect(decisionSchema.safeParse({ tenantId: TENANT, decision: 'decline' }).success).toBe(false)
    expect(decisionSchema.safeParse({ tenantId: TENANT, decision: 'decline', reasonCode: 'talk_first' }).success).toBe(true)
  })
  test('only an approval may change the amount', () => {
    expect(decisionSchema.safeParse({ tenantId: TENANT, decision: 'decline', reasonCode: 'talk_first', amountOverride: 10 }).success).toBe(false)
    expect(decisionSchema.safeParse({ tenantId: TENANT, decision: 'approve', amountOverride: 10 }).success).toBe(true)
  })
})

describe('rulesUpdateSchema', () => {
  test('is strict and bounded', () => {
    expect(rulesUpdateSchema.safeParse({ tenantId: TENANT, directRefundCap: 500 }).success).toBe(true)
    expect(rulesUpdateSchema.safeParse({ tenantId: TENANT, expiryMinutes: 1 }).success).toBe(false)
    expect(rulesUpdateSchema.safeParse({ tenantId: TENANT, isOwner: true }).success).toBe(false)
  })
})

describe('reasons (design-spec §4)', () => {
  test('every kind offers "Other", codes are unique', () => {
    for (const reasons of [...Object.values(REASONS_BY_KIND), DECLINE_REASONS]) {
      expect(reasons.map((r) => r.code)).toContain('other')
      expect(new Set(reasons.map((r) => r.code)).size).toBe(reasons.length)
    }
  })
  test('the stock switch is pre-set by reason', () => {
    expect(defaultRestock('refund', 'wrong_item')).toBe(false)
    expect(defaultRestock('cancel_paid', 'customer_left')).toBe(true)
    expect(defaultRestock('refund', 'nope')).toBe(false)
  })
})
