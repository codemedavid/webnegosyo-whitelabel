/**
 * Cash reports (W3.1) and the Cashiers tab model: rows in either case,
 * money kept null when unknown, and over/short told as a pattern.
 */
import type { CashRpcClient } from '@/lib/cash/cash-rpc'
import { CASH_REPORT_FORBIDDEN, parseCashByStaff, parseCashSummary, readCashByStaff, readCashSummary } from '@/lib/cash/cash-reports'
import { buildCashierTrends, patternSentence, stripBars } from '@/components/admin/cash/cashiers-model'

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function shiftRow(index: number, difference: number | null, overrides: Record<string, unknown> = {}) {
  return {
    shift_id: `s${index}`,
    business_day: '2026-10-20',
    outlet_id: null,
    staff_user_id: 'ana',
    staff_name: 'Ana R.',
    drawer_name: 'Cashier 1',
    opened_at: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
    closed_at: new Date(Date.UTC(2026, 9, 1 + index, 9)).toISOString(),
    close_kind: 'counted',
    expected_cents: 100000,
    first_count_cents: 100000 + (difference ?? 0),
    final_count_cents: 100000 + (difference ?? 0),
    difference_cents: difference,
    remittance_status: 'accepted',
    ...overrides,
  }
}

function rpc(reply: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client: CashRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args })
      return Promise.resolve(reply)
    },
  }
  return { client, calls }
}

describe('parsers', () => {
  it('reads shift rows (bigint as text) and cashier rows', () => {
    const [shift] = parseCashSummary([shiftRow(1, -12000, { final_count_cents: '88000' })])
    const [cashier] = parseCashByStaff([{ staff_user_id: 'ana', staff_name: 'Ana R.', shifts: 14, short_count: 3, over_count: 1, over_short_cents: '-26000', forced_closes: 1, recount_changed: 2 }])

    expect(shift).toMatchObject({ shiftId: 's1', finalCountCents: 88000, differenceCents: -12000, staffName: 'Ana R.' })
    expect(cashier).toEqual({ staffUserId: 'ana', staffName: 'Ana R.', shifts: 14, shortCount: 3, overCount: 1, overShortCents: -26000, forcedCloses: 1, recountChanged: 2 })
  })

  it('keeps a shift with no count as null, never ₱0', () => {
    expect(parseCashSummary([shiftRow(1, null, { final_count_cents: null })])[0].differenceCents).toBeNull()
  })
})

describe('readers', () => {
  it('send the business-day range and branch', async () => {
    const { client, calls } = rpc({ data: [], error: null })

    await readCashSummary(client, { tenantId: TENANT, fromDay: '2026-09-28', toDay: '2026-10-27', outletId: null })
    await readCashByStaff(client, { tenantId: TENANT, fromDay: '2026-09-28', toDay: '2026-10-27', outletId: 'o1' })

    expect(calls).toEqual([
      { fn: 'report_cash_summary', args: { p_tenant: TENANT, p_from_day: '2026-09-28', p_to_day: '2026-10-27', p_outlet: null } },
      { fn: 'report_cash_by_staff', args: { p_tenant: TENANT, p_from_day: '2026-09-28', p_to_day: '2026-10-27', p_outlet: 'o1' } },
    ])
  })

  it('refuse more than 93 days without calling, and say who may see it on 42501', async () => {
    const empty = rpc({ data: [], error: null })
    const refused = rpc({ data: null, error: { code: '42501', message: 'cash_manage' } })

    expect((await readCashSummary(empty.client, { tenantId: TENANT, fromDay: '2026-01-01', toDay: '2026-10-27', outletId: null })).ok).toBe(false)
    expect(empty.calls).toHaveLength(0)
    expect(await readCashByStaff(refused.client, { tenantId: TENANT, fromDay: '2026-10-01', toDay: '2026-10-27', outletId: null })).toEqual({
      ok: false,
      error: { kind: 'forbidden', message: CASH_REPORT_FORBIDDEN },
    })
  })
})

describe('cashier trends', () => {
  it('keeps the last 14 shifts, oldest first, and words the pattern', () => {
    const differences = [0, 0, -2000, 0, 500, 0, -4000, 0, 0, 1000, 0, -6000, 0, -12000, 0, 0]
    const shifts = parseCashSummary(differences.map((difference, index) => shiftRow(index, difference)))
    const staff = parseCashByStaff([{ staff_user_id: 'ana', staff_name: 'Ana R.', shifts: 16, short_count: 4, over_count: 2, over_short_cents: -22500, forced_closes: 0, recount_changed: 1 }])

    const [ana] = buildCashierTrends(shifts, staff)

    expect(ana.strip).toHaveLength(14)
    expect(ana.strip[0]).toBe(-2000)
    expect(ana.sentence).toBe('Short 4 times, over twice in the last 14 shifts · −₱225.00 in all')
    expect(ana.recountChanged).toBe(1)
  })

  it('says so plainly when nothing was off, or nothing was counted', () => {
    expect(patternSentence([0, 0, 0], 3, 0)).toBe('No short or over in the last 3 shifts')
    expect(patternSentence([null], 1, null)).toBe('No counted shifts in the last shift')
    expect(patternSentence([-500], 1, -500)).toBe('Short once in the last 1 shift · −₱5.00 in all')
  })

  it('lists a cashier from the summary even without shifts in the strip, by name', () => {
    const trends = buildCashierTrends([], parseCashByStaff([{ staff_user_id: 'ben', staff_name: 'Ben', shifts: 0 }, { staff_user_id: 'ana', staff_name: 'Ana' }]))

    expect(trends.map((trend) => trend.name)).toEqual(['Ana', 'Ben'])
  })

  it('draws bars as a share of the biggest difference, with no bar for an uncounted shift', () => {
    expect(stripBars([-12000, 6000, 0, null])).toEqual([
      { share: 1, direction: 'short' },
      { share: 0.5, direction: 'over' },
      { share: 0, direction: 'exact' },
      { share: 0, direction: 'none' },
    ])
  })
})
