import { describeActivity } from './describe'
import { formatSignedPeso } from './format'
import type { StoreActivityEvent } from './store-event'
import { categoryOfKind, isRoutineKind, type ActivityKind } from './taxonomy'

function event(kind: ActivityKind, patch: Partial<StoreActivityEvent> = {}): StoreActivityEvent {
  return {
    id: 'e1',
    outletId: null,
    outletName: null,
    occurredAt: '2026-10-12T04:33:00.000Z',
    category: categoryOfKind(kind),
    kind,
    isRoutine: isRoutineKind(kind),
    actorUserId: 'u1',
    actorName: 'Ana Reyes',
    approvedByName: null,
    amount: null,
    quantity: null,
    unit: null,
    reason: null,
    note: null,
    subjectType: 'order',
    subjectRef: 'o1',
    orderNumber: '#14',
    before: null,
    after: null,
    summary: {},
    flags: [],
    reviewedAt: null,
    reviewedByName: null,
    ...patch,
  }
}

describe('describeActivity (app copy)', () => {
  it('writes the refund sentence with both names', () => {
    expect(
      describeActivity(event('refund.issued', {
        amount: -185, reason: 'Wrong item served', approvedByName: 'Marco Santos', summary: { refundNumber: 'R-0042' },
      })),
    ).toEqual({
      title: 'Ana refunded #14 · R-0042',
      subtitle: 'Wrong item served · approved by Marco',
      amountLabel: '−₱185',
      tone: 'negative',
      icon: 'refund',
    })
  })

  it('reads a cancel by nobody as something that happened', () => {
    expect(describeActivity(event('order.cancelled', { actorName: null, actorUserId: null })).title).toBe('#14 was cancelled')
  })

  it('formats signed pesos the Hermes-safe way', () => {
    expect(formatSignedPeso(-1234.5)).toBe('−₱1,234.50')
    expect(formatSignedPeso(10)).toBe('+₱10')
  })
})
