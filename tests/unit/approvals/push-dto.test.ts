/**
 * @jest-environment node
 */
import {
  buildBatchedPush,
  buildRequestPush,
  buildResultPush,
  formatPesoShort,
  selectApprovalTargets,
  toExpoMessage,
  type ApproverCandidate,
} from '@/lib/approvals/push'
import { canViewRequest, toApprovalRecord, toApprovalView } from '@/lib/approvals/dto'
import { DEFAULT_APPROVAL_RULES } from '@/lib/approvals/rules'
import type { ApprovalActor, ApprovalRequestRecord } from '@/lib/approvals/types'

const rules = { ...DEFAULT_APPROVAL_RULES }
const NOW = new Date('2026-10-12T06:00:00Z')

function candidate(overrides: Partial<ApproverCandidate>): ApproverCandidate {
  return { userId: 'u', role: 'admin', isOwner: false, permissions: ['pos'], outletId: null, displayName: 'Someone', ...overrides }
}
const lorna = candidate({ userId: 'u-lorna', isOwner: true, permissions: null, displayName: 'Lorna Cruz' })
const marco = candidate({ userId: 'u-marco', permissions: ['approve_requests'], displayName: 'Marco Reyes' })
const bgcManager = candidate({ userId: 'u-bgc', permissions: ['approve_requests'], outletId: 'o-bgc', displayName: 'Bea' })
const ana = candidate({ userId: 'u-ana', permissions: ['pos'], displayName: 'Ana Santos' })
const legacy = candidate({ userId: 'u-legacy', permissions: null, displayName: 'Old Admin' })
const superadmin = candidate({ userId: 'u-super', role: 'superadmin', permissions: null, displayName: 'Platform' })

function record(overrides: Partial<ApprovalRequestRecord> = {}): ApprovalRequestRecord {
  return {
    id: 'req-1', tenantId: 't-1', outletId: 'o-makati', kind: 'refund', status: 'pending', isDirect: false,
    externalOrderId: 'order-1', orderNumber: '#14', payload: { scope: 'amount', amount: 185 }, amount: 185, approvedAmount: null,
    reasonCode: 'wrong_item', note: null, orderSnapshot: null, requestedBy: 'u-ana', requestedByName: 'Ana Santos',
    requesterShiftId: null, decidedBy: null, decidedByName: null, decidedAt: null, decisionReasonCode: null, decisionNote: null,
    expiresAt: '2026-10-12T06:30:00Z', executedAt: null, result: null, error: null,
    createdAt: '2026-10-12T05:59:00Z', updatedAt: '2026-10-12T05:59:00Z', ...overrides,
  }
}

describe('selectApprovalTargets', () => {
  const all = [lorna, marco, bgcManager, ana, legacy, superadmin]
  test('owner + in-reach approvers whose limit covers it; never the requester', () => {
    expect(selectApprovalTargets(all, record(), rules).map((t) => t.userId).sort()).toEqual(['u-lorna', 'u-marco'])
  })
  test('over the manager limit only the owner is rung', () => {
    expect(selectApprovalTargets(all, record({ amount: 1450 }), rules).map((t) => t.userId)).toEqual(['u-lorna'])
  })
  test('an approver asking never rings themselves', () => {
    expect(selectApprovalTargets(all, record({ requestedBy: 'u-marco' }), rules).map((t) => t.userId)).toEqual(['u-lorna'])
  })
  test('a branch manager is rung for their own branch', () => {
    expect(selectApprovalTargets(all, record({ outletId: 'o-bgc' }), rules).map((t) => t.userId).sort())
      .toEqual(['u-bgc', 'u-lorna', 'u-marco'])
  })
})

describe('push copy (design-spec §3.12)', () => {
  test('refund request: order no., amount, first name, reason — no customer data', () => {
    const push = buildRequestPush(record({ orderSnapshot: { customer: 'Lara Santos' } }), { userId: 'u-marco', withinLimit: true }, rules)
    expect(push.title).toBe('Refund ₱185 · Order #14')
    expect(push.body).toBe('Ana: Wrong item served')
    expect(push.categoryId).toBe('approval_within_limit')
    expect(JSON.stringify(push)).not.toContain('Lara')
  })
  test('over the manager limit says so to the owner', () => {
    const push = buildRequestPush(record({ amount: 1450, reasonCode: 'charged_twice' }), { userId: 'u-lorna', withinLimit: true }, rules)
    expect(push.title).toBe('Refund ₱1,450 · Order #14')
    expect(push.body).toBe('Ana: Charged twice · over the ₱1,000 manager limit')
  })
  test('cancel and write-off titles', () => {
    expect(buildRequestPush(record({ kind: 'cancel_paid', amount: 310, orderNumber: '#22', reasonCode: 'customer_left' }), { userId: 'x', withinLimit: true }, rules).title)
      .toBe('Cancel paid order #22 · ₱310')
    expect(buildRequestPush(record({ kind: 'stock_writeoff', amount: 640, externalOrderId: null, orderNumber: null, reasonCode: 'spoiled',
      orderSnapshot: { ingredientName: 'pork belly', quantity: 2, unit: 'kg' } }), { userId: 'x', withinLimit: true }, rules).title)
      .toBe('Write off 2 kg pork belly · ₱640')
  })
  test('batched push carries no actions', () => {
    const push = buildBatchedPush('t-1', [
      { amount: 185, requestedByName: 'Ana S', kind: 'refund' },
      { amount: 555, requestedByName: 'Jomar', kind: 'refund' },
      { amount: 100, requestedByName: 'Ana S', kind: 'cancel_paid' },
    ])
    expect(push.title).toBe('3 requests waiting · ₱840')
    expect(push.body).toBe('Ana, Jomar · tap to review')
    expect(push.categoryId).toBeUndefined()
  })
  test('result pushes to the requester', () => {
    expect(buildResultPush(record({ status: 'executed', decidedByName: 'Marco Reyes' }), 30)).toMatchObject({
      title: 'Approved: refund ₱185 on #14', body: 'Marco said yes. Give it back from your drawer.',
    })
    expect(buildResultPush(record({ status: 'declined', decidedByName: 'Marco', decisionReasonCode: 'offer_replacement' }), 30)?.body)
      .toBe('Marco: Offer a replacement instead')
    expect(buildResultPush(record({ status: 'expired' }), 30)?.body).toBe('The request closed after 30 min. You can ask again.')
    expect(buildResultPush(record({ status: 'pending' }), 30)).toBeNull()
  })
  test('formatPesoShort drops zero centavos', () => {
    expect(formatPesoShort(185)).toBe('₱185')
    expect(formatPesoShort(12.5)).toBe('₱12.50')
    expect(formatPesoShort(18420)).toBe('₱18,420')
  })
})

describe('toExpoMessage — Android channel only where registered', () => {
  const content = { title: 't', body: 'b', data: { type: 'approval_request' }, categoryId: 'approval_within_limit' as const }
  test('android with the channel gets channelId approvals', () => {
    expect(toExpoMessage({ token: 'a', userId: 'u', platform: 'android', channels: ['approvals'] }, content, true).channelId).toBe('approvals')
  })
  test('android without it falls back to the default channel', () => {
    expect(toExpoMessage({ token: 'a', userId: 'u', platform: 'android', channels: [] }, content, true).channelId).toBeUndefined()
  })
  test('iOS is time-sensitive for requests, never a channel', () => {
    const message = toExpoMessage({ token: 'i', userId: 'u', platform: 'ios', channels: ['approvals'] }, content, true)
    expect(message.channelId).toBeUndefined()
    expect(message.interruptionLevel).toBe('time-sensitive')
  })
})

describe('dto visibility', () => {
  const viewer = (overrides: Partial<ApprovalActor>): ApprovalActor => ({ userId: 'v', role: 'admin', isOwner: false, permissions: ['pos'], outletId: null, ...overrides })
  test('requester sees their own; peers do not; approvers in reach do', () => {
    const r = record()
    expect(canViewRequest(viewer({ userId: 'u-ana' }), r, rules)).toBe(true)
    expect(canViewRequest(viewer({ userId: 'u-peer' }), r, rules)).toBe(false)
    expect(canViewRequest(viewer({ permissions: ['approve_requests'] }), r, rules)).toBe(true)
    expect(canViewRequest(viewer({ permissions: ['approve_requests'], outletId: 'o-bgc' }), r, rules)).toBe(false)
  })
  test('view computes what this viewer may do', () => {
    const managerView = toApprovalView(viewer({ userId: 'u-marco', permissions: ['approve_requests'] }), record({ amount: 1450 }), rules, NOW)
    expect(managerView).toMatchObject({ canDecide: false, canDecline: true, isOverViewerLimit: true, viewerCap: 1000, canWithdraw: false })
    const anaView = toApprovalView(viewer({ userId: 'u-ana' }), record(), rules, NOW)
    expect(anaView).toMatchObject({ canDecide: false, canDecline: false, canWithdraw: true, viewerCap: undefined })
  })
  test('an expired-but-unswept request is shown expired and cannot be decided', () => {
    const view = toApprovalView(viewer({ isOwner: true }), record({ expiresAt: '2026-10-12T05:00:00Z' }), rules, NOW)
    expect(view.status).toBe('expired')
    expect(view.canDecide).toBe(false)
  })
  test('discount tokens are shown only to the requester', () => {
    const r = record({ kind: 'discount', status: 'executed', result: { discountToken: 'secret', amountOff: 50 } })
    expect(toApprovalView(viewer({ isOwner: true }), r, rules, NOW).result).toEqual({ amountOff: 50 })
    expect(toApprovalView(viewer({ userId: 'u-ana' }), r, rules, NOW).result).toMatchObject({ discountToken: 'secret' })
  })
  test('maps a raw row and its refund label', () => {
    const mapped = toApprovalRecord({
      id: 'x', tenant_id: 't', kind: 'cancel_paid', status: 'executed', amount: '310.00', requested_by: 'u',
      reason_code: 'customer_left', expires_at: 'e', created_at: 'c', result: { refundLabel: 'R-0042' },
    })
    expect(mapped.amount).toBe(310)
    expect(toApprovalView(viewer({ isOwner: true }), mapped, rules, NOW).refundLabel).toBe('R-0042')
  })
})
