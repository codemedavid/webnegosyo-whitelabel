/**
 * Shifts for a business day / range (CONTRACTS §2 `staff_shifts` additions):
 * grouped by the STORED `business_day`, branch-scoped like the reports, paged
 * past the 1000-row API cap, money in centavos, and a result that never reads
 * a missing count as "Exact".
 */

import {
  MAX_SHIFT_ROWS,
  judgeCashShift,
  readShiftsForDay,
  readShiftsForRange,
  summarizeCashShifts,
  type CashShift,
} from '@/lib/cash/shifts-read'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OUTLET_A = '33333333-3333-4333-8333-333333333333'
const OUTLET_B = '44444444-4444-4444-8444-444444444444'

function shiftRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'shift-1',
    tenant_id: TENANT_ID,
    outlet_id: OUTLET_A,
    staff_user_id: 'u1',
    staff_name: 'Ana R.',
    drawer_name: 'Cashier 1',
    status: 'closed',
    opening_float: 2000,
    expected_cash: 8465,
    closing_count: '8345.00',
    opened_at: '2026-10-24T10:02:00.000Z',
    closed_at: '2026-10-24T18:48:00.000Z',
    business_day: '2026-10-24',
    service_period_id: null,
    is_blind: false,
    close_kind: 'counted',
    variance_reason: 'wrong_change',
    is_zero_balance: false,
    closed_by_name: null,
    ...overrides,
  }
}

function shift(overrides: Partial<CashShift> = {}): CashShift {
  return {
    id: 's',
    outletId: null,
    staffUserId: null,
    staffName: 'Ana',
    drawerName: null,
    status: 'closed',
    openingFloatCents: 200000,
    expectedCents: 846500,
    countedCents: 846500,
    openedAt: '2026-10-24T10:00:00.000Z',
    closedAt: '2026-10-24T18:00:00.000Z',
    businessDay: '2026-10-24',
    servicePeriodId: null,
    isBlind: false,
    closeKind: 'counted',
    varianceReason: null,
    isZeroBalance: false,
    closedByName: null,
    ...overrides,
  }
}

describe('readShiftsForDay', () => {
  it('reads the shifts stamped with that business day, oldest first, in centavos', async () => {
    const { client } = fakeSupabaseTables({
      staff_shifts: [
        shiftRow({ id: 'late', opened_at: '2026-10-24T16:00:00.000Z' }),
        shiftRow({ id: 'early', opened_at: '2026-10-24T02:00:00.000Z' }),
        // Opened after midnight, but stamped with the day before: it is Friday's.
        shiftRow({ id: 'after-midnight', business_day: '2026-10-23', opened_at: '2026-10-24T17:30:00.000Z' }),
        shiftRow({ id: 'other-store', tenant_id: 'x' }),
      ],
    })

    const shifts = await readShiftsForDay(client, { tenantId: TENANT_ID, day: '2026-10-24', outletId: null })

    expect(shifts.map((s) => s.id)).toEqual(['early', 'late'])
    expect(shifts[0]).toMatchObject({
      staffName: 'Ana R.',
      drawerName: 'Cashier 1',
      openingFloatCents: 200000,
      expectedCents: 846500,
      countedCents: 834500,
      varianceReason: 'wrong_change',
      businessDay: '2026-10-24',
    })
  })

  it('reads only the picked branch when one is given', async () => {
    const { client } = fakeSupabaseTables({
      staff_shifts: [shiftRow({ id: 'a', outlet_id: OUTLET_A }), shiftRow({ id: 'b', outlet_id: OUTLET_B })],
    })

    const shifts = await readShiftsForDay(client, { tenantId: TENANT_ID, day: '2026-10-24', outletId: OUTLET_B })

    expect(shifts.map((s) => s.id)).toEqual(['b'])
  })

  it('refuses a day that is not YYYY-MM-DD without reading', async () => {
    const { client, seen } = fakeSupabaseTables({ staff_shifts: [] })

    await expect(readShiftsForDay(client, { tenantId: TENANT_ID, day: '24/10/2026', outletId: null })).rejects.toThrow()
    expect(seen).toHaveLength(0)
  })

  it('throws (never an empty day) when the read fails', async () => {
    const { client } = fakeSupabaseTables({}, { staff_shifts: 'column staff_shifts.business_day does not exist' })

    await expect(readShiftsForDay(client, { tenantId: TENANT_ID, day: '2026-10-24', outletId: null })).rejects.toThrow()
  })
})

describe('readShiftsForRange', () => {
  it('pages past the 1000-row API cap', async () => {
    const rows = Array.from({ length: 2345 }, (_, index) =>
      shiftRow({ id: `s${index}`, opened_at: new Date(Date.UTC(2026, 9, 1) + index * 60_000).toISOString(), business_day: '2026-10-01' }),
    )
    const { client, requests } = fakeSupabaseTables({ staff_shifts: rows })

    const shifts = await readShiftsForRange(client, { tenantId: TENANT_ID, fromDay: '2026-10-01', toDay: '2026-10-31', outletId: null })

    expect(shifts).toHaveLength(2345)
    expect(requests.length).toBeGreaterThanOrEqual(3)
  })

  it('stops at its ceiling and says so instead of reading forever', async () => {
    const rows = Array.from({ length: MAX_SHIFT_ROWS + 5 }, (_, index) =>
      shiftRow({ id: `s${index}`, opened_at: new Date(Date.UTC(2026, 9, 1) + index * 1000).toISOString(), business_day: '2026-10-02' }),
    )
    const { client } = fakeSupabaseTables({ staff_shifts: rows })

    await expect(
      readShiftsForRange(client, { tenantId: TENANT_ID, fromDay: '2026-10-01', toDay: '2026-10-31', outletId: null }),
    ).rejects.toThrow(/too many shifts/i)
  })

  it('refuses a range that runs backwards or longer than 93 days', async () => {
    const { client } = fakeSupabaseTables({ staff_shifts: [] })

    await expect(readShiftsForRange(client, { tenantId: TENANT_ID, fromDay: '2026-10-31', toDay: '2026-10-01', outletId: null })).rejects.toThrow()
    await expect(readShiftsForRange(client, { tenantId: TENANT_ID, fromDay: '2026-01-01', toDay: '2026-10-01', outletId: null })).rejects.toThrow()
  })
})

describe('judgeCashShift', () => {
  it('is "open" while the drawer is still open', () => {
    expect(judgeCashShift(shift({ status: 'open', closedAt: null, countedCents: null }))).toEqual({ kind: 'open', differenceCents: null })
  })

  it('is "uncounted" (never Exact) when a closed shift has no count or no expected figure', () => {
    expect(judgeCashShift(shift({ countedCents: null }))).toEqual({ kind: 'uncounted', differenceCents: null })
    expect(judgeCashShift(shift({ expectedCents: null }))).toEqual({ kind: 'uncounted', differenceCents: null })
  })

  it('reads counted − expected: exact, short or over', () => {
    expect(judgeCashShift(shift())).toEqual({ kind: 'exact', differenceCents: 0 })
    expect(judgeCashShift(shift({ countedCents: 834500 }))).toEqual({ kind: 'short', differenceCents: -12000 })
    expect(judgeCashShift(shift({ countedCents: 847000 }))).toEqual({ kind: 'over', differenceCents: 500 })
  })
})

describe('summarizeCashShifts', () => {
  it('adds up the day: open drawers, counted cash and net short/over over the counted shifts only', () => {
    const summary = summarizeCashShifts([
      shift({ id: 'exact' }),
      shift({ id: 'short', countedCents: 834500 }),
      shift({ id: 'over', countedCents: 847000 }),
      shift({ id: 'open', status: 'open', closedAt: null, countedCents: null }),
      shift({ id: 'uncounted', countedCents: null }),
    ])

    expect(summary).toEqual({
      count: 5,
      openCount: 1,
      countedCount: 3,
      countedCents: 846500 + 834500 + 847000,
      netDifferenceCents: -11500,
      shortCount: 1,
      overCount: 1,
      exactCount: 1,
    })
  })

  it('has no net difference (null, not ₱0) when nothing was counted', () => {
    expect(summarizeCashShifts([shift({ status: 'open', countedCents: null })]).netDifferenceCents).toBeNull()
  })
})
