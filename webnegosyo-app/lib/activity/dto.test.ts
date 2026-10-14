import { parseStoreActivityRows, parseStoreActivitySummary } from './dto'

const ROW = {
  id: 'r1',
  outlet_id: null,
  outlet_name: null,
  occurred_at: '2026-10-12T04:33:00.123456+00:00',
  category: 'cash',
  kind: 'shift.closed',
  is_routine: false,
  actor_user_id: 'u1',
  actor_name: 'Ana',
  approved_by_name: null,
  amount: '-150.00',
  quantity: null,
  unit: null,
  reason: null,
  note: null,
  subject_type: 'shift',
  subject_ref: 's1',
  order_number: null,
  before: null,
  after: { expectedCash: 1500, closingCount: 1350 },
  summary: { title: 'Shift closed · drawer short ₱150' },
  flags: ['drawer_variance', 'mystery'],
  reviewed_at: null,
  reviewed_by_name: null,
}

describe('parseStoreActivityRows (app)', () => {
  it('maps snake_case rows and normalises numbers, time and flags', () => {
    const [shift] = parseStoreActivityRows([ROW])
    expect(shift).toMatchObject({
      id: 'r1',
      category: 'cash',
      kind: 'shift.closed',
      amount: -150,
      occurredAt: '2026-10-12T04:33:00.123Z',
      flags: ['drawer_variance'],
      subjectType: 'shift',
    })
  })

  it('drops unknown kinds and refuses malformed payloads', () => {
    expect(parseStoreActivityRows([{ ...ROW, kind: 'shift.teleported' }])).toEqual([])
    expect(() => parseStoreActivityRows('nope')).toThrow(/store activity/i)
    expect(() => parseStoreActivityRows([{ ...ROW, is_routine: 'no' }])).toThrow(/store activity/i)
  })
})

describe('parseStoreActivitySummary (app)', () => {
  it('keeps Senior/PWD discounts apart', () => {
    const summary = parseStoreActivitySummary({
      byKind: [{ kind: 'discount.applied', statutory: true, count: 1, amount: -20, quantity: null }],
      byActor: [],
      byDay: [],
      flaggedOpen: 0,
    })
    expect(summary.byKind).toEqual([{ kind: 'discount.applied', statutory: true, count: 1, amount: -20, quantity: null }])
  })
})
