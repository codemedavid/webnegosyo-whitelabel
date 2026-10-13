/**
 * @jest-environment node
 */
import { runApprovalSideEffects, type SideEffectDeps } from '@/lib/approvals/execute'
import type { ApprovalRequestRecord } from '@/lib/approvals/types'

function record(overrides: Partial<ApprovalRequestRecord> = {}): ApprovalRequestRecord {
  return {
    id: 'req-1', tenantId: 't-1', outletId: 'o-1', kind: 'refund', status: 'executed', isDirect: false,
    externalOrderId: 'order-1', orderNumber: '#14', payload: { reasonLabel: 'Wrong item served' }, amount: 185, approvedAmount: null,
    reasonCode: 'wrong_item', note: 'cold', orderSnapshot: { status: 'delivered' }, requestedBy: 'u-ana', requestedByName: 'Ana',
    requesterShiftId: 's-1', decidedBy: 'u-marco', decidedByName: 'Marco', decidedAt: 'd', decisionReasonCode: null, decisionNote: null,
    expiresAt: 'e', executedAt: 'x', result: null, error: null, createdAt: 'c', updatedAt: 'u', ...overrides,
  }
}

function deps(overrides: Partial<SideEffectDeps> = {}): SideEffectDeps & Record<string, jest.Mock> {
  return {
    restoreWholeOrderStock: jest.fn().mockResolvedValue(undefined),
    restoreRevisionStock: jest.fn().mockResolvedValue(undefined),
    loadOrder: jest.fn().mockResolvedValue({ outletId: 'o-1', customerData: { presell: true }, status: 'cancelled' }),
    releasePresell: jest.fn().mockResolvedValue(true),
    runLoyalty: jest.fn().mockResolvedValue(undefined),
    recordCancelEvent: jest.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-10-12T06:00:00Z'),
    ...overrides,
  } as SideEffectDeps & Record<string, jest.Mock>
}

describe('runApprovalSideEffects', () => {
  test('whole refund with restock: stock back, pre-sell released, loyalty reconciled, cancel logged with reason', async () => {
    const d = deps()
    const report = await runApprovalSideEffects(
      record({ kind: 'cancel_paid', result: { scope: 'whole', restock: true, statusChanged: true } }),
      d,
    )
    expect(report).toMatchObject({ stock: 'done', presell: 'done', loyalty: 'done', statusEvent: 'done' })
    expect(d.restoreWholeOrderStock).toHaveBeenCalledWith('t-1', 'order-1', 'u-ana')
    expect(d.recordCancelEvent).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'Wrong item served', note: 'cold', previousStatus: 'delivered', actorUserId: 'u-ana',
    }))
  })

  test('items refund with restock returns only the refunded lines at the new revision', async () => {
    const d = deps()
    const report = await runApprovalSideEffects(
      record({ result: { scope: 'items', restock: true, statusChanged: false, revisionNumber: 3,
        lines: [{ menuItemId: 'm-1', quantity: 2 }, { menuItemId: null, quantity: 1 }] } }),
      d,
    )
    expect(d.restoreRevisionStock).toHaveBeenCalledWith(expect.objectContaining({
      revision: 3, restore: [{ menuItemId: 'm-1', quantity: 2 }], outletId: 'o-1',
    }))
    expect(report).toMatchObject({ stock: 'done', presell: 'not_needed', loyalty: 'not_needed', statusEvent: 'not_needed' })
  })

  test('without restock the stock stays spent', async () => {
    const d = deps()
    const report = await runApprovalSideEffects(record({ result: { scope: 'amount', restock: false } }), d)
    expect(report?.stock).toBe('not_needed')
    expect(d.restoreWholeOrderStock).not.toHaveBeenCalled()
  })

  test('one failing follow-up is recorded and does not stop the others', async () => {
    const d = deps({ releasePresell: jest.fn().mockRejectedValue(new Error('presell down')) })
    const report = await runApprovalSideEffects(
      record({ kind: 'cancel_paid', result: { scope: 'whole', restock: false, statusChanged: true } }),
      d,
    )
    expect(report).toMatchObject({ presell: 'failed: presell down', loyalty: 'done', statusEvent: 'done' })
  })

  test('nothing runs for failed requests or non-money kinds', async () => {
    expect(await runApprovalSideEffects(record({ status: 'failed' }), deps())).toBeNull()
    expect(await runApprovalSideEffects(record({ kind: 'discount' }), deps())).toBeNull()
  })
})
