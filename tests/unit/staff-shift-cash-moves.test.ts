/**
 * Pay-outs on the web shift history.
 *
 * The staff pages kept only pickups (`collect`) from a drawer's cash moves, so
 * money spent out of the till — ice, LPG, a rider — was netted into expected
 * cash and never named: the owner saw a smaller turnover and no reason for it.
 */
import { summarizeShiftCashMoves } from '@/lib/staff-activity/shift-cash-moves'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

function loadService(): Promise<typeof import('@/lib/staff-activity/staff-activity-service')> {
  // next/jest leaves static imports ahead of jest.mock, so import lazily.
  return import('@/lib/staff-activity/staff-activity-service')
}

const SHIFT_ROW = {
  id: 's1',
  outlet_id: null,
  staff_user_id: 'ana',
  staff_name: 'Ana',
  status: 'closed',
  opening_float: '500.00',
  expected_cash: '1200.00',
  closing_count: '1200.00',
  note: null,
  opened_at: '2026-10-21T01:00:00Z',
  closed_at: '2026-10-21T09:00:00Z',
}

describe('summarizeShiftCashMoves', () => {
  test('totals each kind separately', () => {
    // Arrange
    const moves = [
      { kind: 'collect', amount: '1000.00' },
      { kind: 'pay_in', amount: '200.00', reason: 'More change' },
      { kind: 'pay_out', amount: '85.50', reason: 'Ice', recorded_by_name: 'Ana', created_at: '2026-10-21T03:00:00Z' },
      { kind: 'pay_out', amount: '450.00', reason: 'LPG', recorded_by_name: 'Ben', created_at: '2026-10-21T02:00:00Z' },
    ]

    // Act
    const summary = summarizeShiftCashMoves(moves)

    // Assert
    expect(summary.collected).toBe(1000)
    expect(summary.paidIn).toBe(200)
    expect(summary.paidOut).toBe(535.5)
  })

  test('lists every pay-out with its reason, oldest first', () => {
    const summary = summarizeShiftCashMoves([
      { kind: 'pay_out', amount: '85.50', reason: 'Ice', recorded_by_name: 'Ana', created_at: '2026-10-21T03:00:00Z' },
      { kind: 'pay_in', amount: '200.00', reason: 'More change', recorded_by_name: 'Ana', created_at: '2026-10-21T01:30:00Z' },
      { kind: 'pay_out', amount: 450, reason: ' LPG ', recorded_by_name: 'Ben', created_at: '2026-10-21T02:00:00Z' },
    ])

    expect(summary.payOuts).toEqual([
      { amount: 450, reason: 'LPG', recordedByName: 'Ben', createdAt: '2026-10-21T02:00:00Z' },
      { amount: 85.5, reason: 'Ice', recordedByName: 'Ana', createdAt: '2026-10-21T03:00:00Z' },
    ])
  })

  test('sums in centavos so small amounts never drift', () => {
    const moves = Array.from({ length: 10 }, () => ({ kind: 'pay_out', amount: '0.10', reason: 'Tip jar' }))

    expect(summarizeShiftCashMoves(moves).paidOut).toBe(1)
  })

  test('a blank reason or recorder reads as missing, not as an empty string', () => {
    const [payOut] = summarizeShiftCashMoves([
      { kind: 'pay_out', amount: '20', reason: '   ', recorded_by_name: null },
    ]).payOuts

    expect(payOut).toEqual({ amount: 20, reason: null, recordedByName: null, createdAt: null })
  })

  test('no moves (or a read without the embed) is all zeros', () => {
    const empty = { collected: 0, paidIn: 0, paidOut: 0, payOuts: [] }
    expect(summarizeShiftCashMoves(null)).toEqual(empty)
    expect(summarizeShiftCashMoves(undefined)).toEqual(empty)
    expect(summarizeShiftCashMoves([])).toEqual(empty)
  })

  test('an unreadable amount counts as nothing rather than poisoning the total', () => {
    const summary = summarizeShiftCashMoves([
      { kind: 'pay_out', amount: 'abc', reason: 'Bad row' },
      { kind: 'pay_out', amount: '10', reason: 'Ice' },
    ])

    expect(summary.paidOut).toBe(10)
  })
})

describe('toStaffShift', () => {
  test('carries pay-outs, pay-ins and pickups onto the shift', async () => {
    // Arrange
    const { toStaffShift } = await loadService()
    const row = {
      ...SHIFT_ROW,
      shift_cash_movements: [
        { kind: 'collect', amount: '1000.00', reason: null, recorded_by_name: 'Owner', created_at: '2026-10-21T05:00:00Z' },
        { kind: 'pay_in', amount: '100.00', reason: 'Coins', recorded_by_name: 'Ana', created_at: '2026-10-21T02:00:00Z' },
        { kind: 'pay_out', amount: '85.50', reason: 'Ice', recorded_by_name: 'Ana', created_at: '2026-10-21T03:00:00Z' },
      ],
    }

    // Act
    const shift = toStaffShift(row)

    // Assert
    expect(shift.collected).toBe(1000)
    expect(shift.paidIn).toBe(100)
    expect(shift.paidOut).toBe(85.5)
    expect(shift.payOuts).toEqual([
      { amount: 85.5, reason: 'Ice', recordedByName: 'Ana', createdAt: '2026-10-21T03:00:00Z' },
    ])
    expect(shift.openingFloat).toBe(500)
    expect(shift.expectedCash).toBe(1200)
  })

  test('a shift with no cash moves reports zero, not undefined', async () => {
    const { toStaffShift } = await loadService()

    const shift = toStaffShift({ ...SHIFT_ROW, shift_cash_movements: null })

    expect(shift.collected).toBe(0)
    expect(shift.paidIn).toBe(0)
    expect(shift.paidOut).toBe(0)
    expect(shift.payOuts).toEqual([])
  })
})
