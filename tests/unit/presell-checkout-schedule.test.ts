/**
 * A presell cart arrives at checkout already knowing its date.
 *
 * The advance-order scheduler stays the mechanism (one `scheduled_for` per
 * order, the same dual-write, the same version-guarded Convex arg) but the
 * presell date takes the wheel: ASAP disappears, the date list collapses to
 * that one day even when it lies past the order type's horizon, and only the
 * time is left to choose. The claim that reserves the stock travels inside
 * customer_data so every backend's cancel path can find it later.
 */

import {
  presellAdvanceConfig,
  presellScheduleDates,
  withPresellCustomerData,
  readPresellClaim,
} from '@/lib/presell/checkout-schedule'
import type { AdvanceOrderConfig, ScheduleDateOption } from '@/lib/advance-order-utils'

const BASE: AdvanceOrderConfig = {
  enabled: false,
  allowAsap: true,
  leadTimeMinutes: 30,
  maxDaysAhead: 7,
  slotIntervalMinutes: 30,
}

// Local-midnight "now" so day arithmetic is exact.
const NOW = new Date(2026, 11, 1, 10, 0, 0, 0)

describe('presellAdvanceConfig', () => {
  it('turns scheduling on and ASAP off even for an order type that never scheduled', () => {
    const cfg = presellAdvanceConfig(BASE, '2026-12-03', NOW)
    expect(cfg.enabled).toBe(true)
    expect(cfg.allowAsap).toBe(false)
  })

  it('stretches the horizon to reach a presell date beyond max_days_ahead', () => {
    const cfg = presellAdvanceConfig(BASE, '2026-12-24', NOW)
    expect(cfg.maxDaysAhead).toBe(23)
  })

  it('never shrinks a horizon that already covers the date', () => {
    const cfg = presellAdvanceConfig({ ...BASE, maxDaysAhead: 30 }, '2026-12-03', NOW)
    expect(cfg.maxDaysAhead).toBe(30)
  })

  it('keeps the order type lead time and slot interval', () => {
    const cfg = presellAdvanceConfig({ ...BASE, leadTimeMinutes: 45, slotIntervalMinutes: 15 }, '2026-12-03', NOW)
    expect(cfg.leadTimeMinutes).toBe(45)
    expect(cfg.slotIntervalMinutes).toBe(15)
  })
})

describe('presellScheduleDates', () => {
  const dates: ScheduleDateOption[] = [
    { value: '2026-12-01', label: 'Today', isToday: true },
    { value: '2026-12-02', label: 'Tomorrow', isToday: false },
    { value: '2026-12-03', label: 'Thu, Dec 3', isToday: false },
  ]

  it('collapses the list to the presell date', () => {
    expect(presellScheduleDates(dates, '2026-12-03')).toEqual([dates[2]])
  })

  it('synthesizes the option when the generator skipped that day', () => {
    const [only] = presellScheduleDates(dates, '2026-12-24')
    expect(only.value).toBe('2026-12-24')
    expect(only.label).toBe('Thu, Dec 24')
    expect(only.isToday).toBe(false)
  })
})

describe('presell customer_data round trip', () => {
  const lines = [{ menuItemId: 'm-bilao', presellDate: '2026-12-24', quantity: 2 }]

  it('stamps the date, the claim id and the claimed lines', () => {
    const cd = withPresellCustomerData({ customer_name: 'Ana' }, { presellDate: '2026-12-24', claimId: 'claim-1', lines })
    expect(cd.customer_name).toBe('Ana')
    expect(readPresellClaim(cd)).toEqual({ presellDate: '2026-12-24', claimId: 'claim-1', lines })
  })

  it('reads nothing from an order that was never a pre-order', () => {
    expect(readPresellClaim({ customer_name: 'Ana' })).toBeNull()
    expect(readPresellClaim(null)).toBeNull()
    expect(readPresellClaim('garbage')).toBeNull()
  })

  it('reads nothing when the stored claim is malformed', () => {
    expect(readPresellClaim({ presell_claim_id: 'x', presell_date: 'not-a-date', presell_lines: [] })).toBeNull()
    expect(readPresellClaim({ presell_claim_id: 'x', presell_date: '2026-12-24', presell_lines: 'nope' })).toBeNull()
  })
})
