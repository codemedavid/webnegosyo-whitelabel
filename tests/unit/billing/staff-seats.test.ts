import { staffSeatSummary } from '@/lib/billing/staff-seats'

/**
 * The Settings → Team card shows one seat line for the whole store and one
 * "Add" button. Seats are per pool (each branch, plus the store-wide pool),
 * so a multi-branch store is only "full" when every pool is.
 */

function member(outletId: string | null, isOwner = false) {
  return { outlet_id: outletId, is_owner: isOwner }
}

describe('staffSeatSummary', () => {
  it("uses the tenant's allowance on a single-location store", () => {
    const summary = staffSeatSummary({
      members: [member(null), member(null), member(null)],
      outletIds: [],
      seatLimit: 5,
    })

    expect(summary).toEqual({ seatsRemaining: 2, label: '3 of 5 staff' })
  })

  it('never counts the owner', () => {
    const summary = staffSeatSummary({
      members: [member(null, true), member(null)],
      outletIds: [],
      seatLimit: 3,
    })

    expect(summary.seatsRemaining).toBe(2)
    expect(summary.label).toBe('1 of 3 staff')
  })

  it('reports no seats left when the store is full or over', () => {
    const summary = staffSeatSummary({
      members: [member(null), member(null), member(null)],
      outletIds: [],
      seatLimit: 2,
    })

    expect(summary.seatsRemaining).toBe(0)
  })

  it('keeps Add open on a multi-branch store while any pool has room', () => {
    const summary = staffSeatSummary({
      members: [member('makati'), member('makati'), member('makati'), member(null)],
      outletIds: ['makati', 'bgc'],
      seatLimit: 3,
    })

    // BGC is empty, so three seats remain there.
    expect(summary.seatsRemaining).toBe(3)
    expect(summary.label).toBe('4 staff · up to 3 per branch')
  })

  it('is full on a multi-branch store only when every pool is', () => {
    const summary = staffSeatSummary({
      members: [member('makati'), member(null)],
      outletIds: ['makati'],
      seatLimit: 1,
    })

    expect(summary.seatsRemaining).toBe(0)
  })

  it('ignores accounts pointing at a branch the store no longer has', () => {
    const summary = staffSeatSummary({
      members: [member('deleted'), member('deleted'), member('makati')],
      outletIds: ['makati'],
      seatLimit: 1,
    })

    // Makati is full; the store-wide pool still has its one seat.
    expect(summary.seatsRemaining).toBe(1)
  })
})
