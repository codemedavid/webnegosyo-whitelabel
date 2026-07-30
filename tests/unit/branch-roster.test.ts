import {
  buildBranchRoster,
  type RosterOutlet,
  type RosterStaff,
} from '@/lib/outlets/branch-roster'
import { MAX_STAFF_PER_TENANT } from '@/lib/staff-permissions'
import type { AnalyticsOrderLike } from '@/lib/outlets/branch-analytics'

/**
 * The one view model behind the redesigned Branches area.
 *
 * The index grid, the store summary strip and each branch's Team tab all read
 * the same object, so a branch's takings, its headcount and its seats left
 * cannot disagree between the card and the page it opens. The arithmetic is
 * pure and lives here rather than in three components.
 *
 * The cases that matter are the awkward ones: a branch that has never taken an
 * order still has to be managed, a store-wide account belongs to nobody's
 * branch, and a staff row pointing at a deleted branch must not silently
 * vanish from the roster the owner is counting seats against.
 */

function outlet(overrides: Partial<RosterOutlet> = {}): RosterOutlet {
  return {
    id: 'makati',
    name: 'Makati',
    slug: 'makati',
    address: '12 Ayala Ave',
    is_active: true,
    ...overrides,
  }
}

function staff(overrides: Partial<RosterStaff> = {}): RosterStaff {
  return {
    user_id: 'u1',
    outlet_id: null,
    is_owner: false,
    display_name: 'Maria Santos',
    email: 'maria@example.com',
    permissions: ['orders'],
    ...overrides,
  }
}

function order(outletId: string | null, total: number, status = 'completed'): AnalyticsOrderLike {
  return {
    total,
    status,
    ...(outletId === null ? {} : { outlet_id: outletId }),
  } as AnalyticsOrderLike
}

describe('buildBranchRoster', () => {
  describe('branches', () => {
    it('keeps a branch that has never taken an order', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'bgc', name: 'BGC' })],
        staff: [],
        orders: [],
      })

      expect(roster.branches).toHaveLength(1)
      expect(roster.branches[0].outlet.name).toBe('BGC')
    })

    it('reports no metrics for a branch that has never taken an order', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'bgc' })],
        staff: [],
        orders: [],
      })

      expect(roster.branches[0].metrics).toBeNull()
    })

    it('attaches revenue to the branch that earned it', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' }), outlet({ id: 'bgc', name: 'BGC', slug: 'bgc' })],
        staff: [],
        orders: [order('makati', 400), order('bgc', 100)],
      })

      expect(roster.branches.find((b) => b.outlet.id === 'makati')?.metrics?.revenue).toBe(400)
    })

    it('preserves the order the branches were given in', () => {
      const roster = buildBranchRoster({
        outlets: [
          outlet({ id: 'bgc', name: 'BGC', slug: 'bgc' }),
          outlet({ id: 'makati', name: 'Makati' }),
        ],
        // Makati out-earns BGC; the grid still follows the merchant's own order.
        staff: [],
        orders: [order('makati', 400), order('bgc', 100)],
      })

      expect(roster.branches.map((b) => b.outlet.id)).toEqual(['bgc', 'makati'])
    })
  })

  describe('team', () => {
    it('lists a staff member under the branch they work at', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [staff({ user_id: 'u1', outlet_id: 'makati' })],
        orders: [],
      })

      expect(roster.branches[0].staff.map((s) => s.user_id)).toEqual(['u1'])
    })

    it('puts an account that covers the whole store in the store-wide list', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [staff({ user_id: 'u1', outlet_id: null })],
        orders: [],
      })

      expect(roster.branches[0].staff).toEqual([])
      expect(roster.storeWideStaff.map((s) => s.user_id)).toEqual(['u1'])
    })

    it('excludes the owner from the store-wide list', () => {
      const roster = buildBranchRoster({
        outlets: [],
        staff: [staff({ user_id: 'owner', is_owner: true })],
        orders: [],
      })

      expect(roster.storeWideStaff).toEqual([])
    })

    it('keeps a member whose branch no longer exists instead of dropping them', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [staff({ user_id: 'ghost', outlet_id: 'deleted-branch' })],
        orders: [],
      })

      expect(roster.orphanedStaff.map((s) => s.user_id)).toEqual(['ghost'])
      expect(roster.storeWideStaff).toEqual([])
    })

    it('counts the seats a branch has left', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [
          staff({ user_id: 'u1', outlet_id: 'makati' }),
          staff({ user_id: 'u2', outlet_id: 'makati' }),
        ],
        orders: [],
      })

      expect(roster.branches[0].staffCount).toBe(2)
      expect(roster.branches[0].seatsRemaining).toBe(MAX_STAFF_PER_TENANT - 2)
    })

    it('never reports negative seats when a branch is over its allowance', () => {
      const over = Array.from({ length: MAX_STAFF_PER_TENANT + 2 }, (_, i) =>
        staff({ user_id: `u${i}`, outlet_id: 'makati' })
      )
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: over,
        orders: [],
      })

      expect(roster.branches[0].seatsRemaining).toBe(0)
    })
  })

  describe('summary', () => {
    it('counts the branches and how many are open to customers', () => {
      const roster = buildBranchRoster({
        outlets: [
          outlet({ id: 'makati' }),
          outlet({ id: 'bgc', name: 'BGC', slug: 'bgc', is_active: false }),
        ],
        staff: [],
        orders: [],
      })

      expect(roster.summary.branchCount).toBe(2)
      expect(roster.summary.activeCount).toBe(1)
    })

    it('names the highest-earning branch', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' }), outlet({ id: 'bgc', name: 'BGC', slug: 'bgc' })],
        staff: [],
        orders: [order('makati', 400), order('bgc', 100)],
      })

      expect(roster.summary.topBranchName).toBe('Makati')
    })

    it('names no top branch before any branch has earned anything', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [],
        orders: [],
      })

      expect(roster.summary.topBranchName).toBeNull()
    })

    it('never crowns the unassigned bucket', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [],
        // The orders nobody attributed out-earn every branch.
        orders: [order(null, 5000), order('makati', 100)],
      })

      expect(roster.summary.topBranchName).toBe('Makati')
    })

    it('counts unattributed takings in store revenue and reports them separately', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [],
        orders: [order(null, 300), order('makati', 700)],
      })

      expect(roster.summary.totalRevenue).toBe(1000)
      expect(roster.unassignedMetrics?.revenue).toBe(300)
    })

    it('reports no unassigned bucket when every order names its branch', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [],
        orders: [order('makati', 700)],
      })

      expect(roster.unassignedMetrics).toBeNull()
    })

    it('leaves cancelled orders out of store revenue', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [],
        orders: [order('makati', 700), order('makati', 900, 'cancelled')],
      })

      expect(roster.summary.totalRevenue).toBe(700)
      expect(roster.summary.totalOrders).toBe(1)
    })

    it('counts every non-owner account across the store', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [
          staff({ user_id: 'owner', is_owner: true }),
          staff({ user_id: 'u1', outlet_id: 'makati' }),
          staff({ user_id: 'u2', outlet_id: null }),
          staff({ user_id: 'ghost', outlet_id: 'deleted-branch' }),
        ],
        orders: [],
      })

      expect(roster.summary.staffCount).toBe(3)
    })
  })

  describe('metrics are unavailable', () => {
    it('reports no metrics anywhere when the order list could not be read', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [],
        orders: null,
      })

      expect(roster.hasMetrics).toBe(false)
      expect(roster.branches[0].metrics).toBeNull()
      expect(roster.summary.totalRevenue).toBe(0)
    })

    it('reports metrics as available once an order list is given, even an empty one', () => {
      const roster = buildBranchRoster({
        outlets: [outlet({ id: 'makati' })],
        staff: [],
        orders: [],
      })

      expect(roster.hasMetrics).toBe(true)
    })
  })
})
