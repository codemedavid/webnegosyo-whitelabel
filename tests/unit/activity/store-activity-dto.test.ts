import { parseStoreActivityRows, parseStoreActivitySummary } from '@/lib/activity/dto'
import {
  RAW_FUTURE_ROW,
  RAW_MISMATCH_ROW,
  RAW_REFUND_ROW,
  RAW_STOCK_ROW,
  RAW_SUMMARY,
} from '../../fixtures/store-activity-rows'

describe('parseStoreActivityRows', () => {
  it('maps an RPC row to the camelCase StoreActivityEvent', () => {
    const [refund] = parseStoreActivityRows([RAW_REFUND_ROW])
    expect(refund).toEqual({
      id: RAW_REFUND_ROW.id,
      outletId: RAW_REFUND_ROW.outlet_id,
      outletName: 'Valenzuela',
      occurredAt: '2026-10-12T04:33:00.123Z',
      category: 'money',
      kind: 'refund.issued',
      isRoutine: false,
      actorUserId: RAW_REFUND_ROW.actor_user_id,
      actorName: 'Ana Reyes',
      approvedByName: null,
      amount: -185,
      quantity: null,
      unit: null,
      reason: 'Wrong item served',
      note: null,
      subjectType: 'order',
      subjectRef: RAW_REFUND_ROW.subject_ref,
      orderNumber: '#14',
      before: null,
      after: null,
      summary: { title: 'Refunded ₱185 on #14', paymentMethod: 'Cash' },
      flags: ['cash_refund_noncash_order'],
      reviewedAt: null,
      reviewedByName: null,
    })
  })

  it('reads numeric strings, null summary and null flags', () => {
    const [stock] = parseStoreActivityRows([RAW_STOCK_ROW])
    expect(stock.amount).toBe(-100)
    expect(stock.quantity).toBe(-2)
    expect(stock.summary).toEqual({})
    expect(stock.flags).toEqual([])
  })

  it('drops kinds this build does not know and rows whose category disagrees', () => {
    const events = parseStoreActivityRows([RAW_REFUND_ROW, RAW_FUTURE_ROW, RAW_MISMATCH_ROW])
    expect(events.map((e) => e.id)).toEqual([RAW_REFUND_ROW.id])
  })

  it('treats a null payload as an empty page', () => {
    expect(parseStoreActivityRows(null)).toEqual([])
  })

  it('fails loudly on a malformed payload', () => {
    expect(() => parseStoreActivityRows({ rows: [] })).toThrow(/store activity/i)
    expect(() => parseStoreActivityRows([{ ...RAW_REFUND_ROW, id: 42 }])).toThrow(/store activity/i)
  })
})

describe('parseStoreActivitySummary', () => {
  it('parses the summary and keeps statutory discounts apart', () => {
    const summary = parseStoreActivitySummary(RAW_SUMMARY)
    expect(summary.flaggedOpen).toBe(3)
    expect(summary.byKind).toEqual([
      { kind: 'refund.issued', statutory: false, count: 2, amount: -370, quantity: null },
      { kind: 'discount.applied', statutory: true, count: 1, amount: -20, quantity: null },
    ])
    expect(summary.byActor[0]).toEqual({
      actorUserId: '31140db3-eb9f-45c2-b0af-c94763106b67', actorName: 'Ana Reyes', kind: 'refund.issued', count: 2, amount: -370,
    })
    expect(summary.byDay).toEqual([{ day: '2026-10-12', kind: 'refund.issued', count: 2, amount: -370 }])
    expect(summary.routine).toEqual([{ kind: 'order.placed', count: 41, amount: 12850.5 }])
  })

  it('treats a missing routine roll-up as empty', () => {
    const { routine, ...older } = RAW_SUMMARY
    expect(routine).toBeDefined()
    expect(parseStoreActivitySummary(older).routine).toEqual([])
  })

  it('fails loudly on a malformed summary', () => {
    expect(() => parseStoreActivitySummary({ byKind: 'nope' })).toThrow(/store activity/i)
  })
})
