/**
 * The one seat line the Settings → Team card shows.
 *
 * Seats are counted per pool — each branch, plus the store-wide accounts —
 * exactly as `assertBranchHasRoom` (src/lib/staff-service.ts) and the
 * `enforce_staff_limit` trigger enforce them. A store-wide sum would read a
 * three-branch business with one person per branch as "3 of 3" and grey out
 * Add while every branch still has room. The owner never takes a seat, and an
 * account pointing at a deleted branch occupies no live pool.
 */

export interface SeatMember {
  outlet_id?: string | null
  is_owner: boolean
}

export interface StaffSeatInput {
  members: readonly SeatMember[]
  /** The store's live branches; empty for a single-location store. */
  outletIds: readonly string[]
  /** Resolved allowance (`resolveStaffLimit`). */
  seatLimit: number
}

export interface StaffSeatSummary {
  /** Seats left in the roomiest pool. Never negative. */
  seatsRemaining: number
  label: string
}

const STORE_WIDE = '__store_wide__'

function poolCounts(members: readonly SeatMember[], outletIds: readonly string[]): Map<string, number> {
  const pools = new Map<string, number>([[STORE_WIDE, 0], ...outletIds.map((id) => [id, 0] as const)])
  for (const member of members) {
    const key = member.outlet_id ?? STORE_WIDE
    const count = pools.get(key)
    if (count !== undefined) pools.set(key, count + 1)
  }
  return pools
}

export function staffSeatSummary({ members, outletIds, seatLimit }: StaffSeatInput): StaffSeatSummary {
  const staff = members.filter((member) => !member.is_owner)

  if (outletIds.length === 0) {
    return {
      seatsRemaining: Math.max(0, seatLimit - staff.length),
      label: `${staff.length} of ${seatLimit} staff`,
    }
  }

  const fewestInAPool = Math.min(...poolCounts(staff, outletIds).values())
  return {
    seatsRemaining: Math.max(0, seatLimit - fewestInAPool),
    label: `${staff.length} staff · up to ${seatLimit} per branch`,
  }
}
