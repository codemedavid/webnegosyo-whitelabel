/**
 * What the superadmin's allowance columns are allowed to claim.
 *
 * The number on this screen is the platform owner's basis for telling a client
 * "you are at your limit" — or for taking money to raise it — so the rules it
 * reports have to be the same ones `staff-service` and the outlets action
 * actually enforce. A column that counted staff store-wide would read `6 / 3`
 * for a three-branch store that is perfectly within its plan.
 */

import { buildAllowanceRows, type AllowanceInput } from '@/lib/billing/tenant-allowances'

const tenant = (overrides: Partial<AllowanceInput> = {}): AllowanceInput => ({
  tenantId: 't1',
  maxOutlets: null,
  maxStaffPerBranch: null,
  outletIds: [],
  staff: [],
  ...overrides,
})

const rowFor = (input: AllowanceInput) => buildAllowanceRows([input])[0]

describe('buildAllowanceRows', () => {
  it('counts the branches a tenant holds against its allowance', () => {
    // Arrange
    const input = tenant({ maxOutlets: 3, outletIds: ['a', 'b'] })

    // Act
    const row = rowFor(input)

    // Assert
    expect(row.outletsUsed).toBe(2)
    expect(row.outletLimit).toBe(3)
    expect(row.isOverOutlets).toBe(false)
  })

  it('falls back to the platform defaults when no allowance is set', () => {
    // A tenant row predating the allowance columns must read as the default
    // plan, never as unlimited — the same resolution the enforcement uses.
    const row = rowFor(tenant())

    expect(row.outletLimit).toBe(1)
    expect(row.staffLimit).toBe(3)
  })

  it('excludes the owner from the seat count', () => {
    // The owner has never occupied a seat: `countStaffInBranch` skips them, so
    // a screen that counted them would show a full store with a seat to spare.
    const row = rowFor(
      tenant({
        staff: [
          { outletId: null, isOwner: true },
          { outletId: null, isOwner: false },
        ],
      })
    )

    expect(row.peakBranchStaff).toBe(1)
  })

  it('reports the fullest single branch, not the store-wide total', () => {
    // Arrange — two branches, two staff each. The cap is per branch, so this
    // store is at 2 of 3, not 4 of 3.
    const input = tenant({
      maxOutlets: 2,
      outletIds: ['makati', 'bgc'],
      staff: [
        { outletId: 'makati' },
        { outletId: 'makati' },
        { outletId: 'bgc' },
        { outletId: 'bgc' },
      ],
    })

    // Act
    const row = rowFor(input)

    // Assert
    expect(row.peakBranchStaff).toBe(2)
    expect(row.isOverStaff).toBe(false)
  })

  it('counts store-wide accounts as their own pool', () => {
    // A store-wide manager does not consume a seat at Makati and at BGC at
    // once — branch-team-panel.tsx says so, and the service agrees.
    const row = rowFor(
      tenant({
        outletIds: ['makati'],
        staff: [{ outletId: null }, { outletId: null }, { outletId: 'makati' }],
      })
    )

    expect(row.peakBranchStaff).toBe(2)
  })

  it('flags a branch allowance that has been lowered below current usage', () => {
    // Downgrading a plan is allowed and takes nothing away, so the row has to
    // say "over" rather than the page refusing to render it.
    const row = rowFor(tenant({ maxOutlets: 1, outletIds: ['a', 'b', 'c'] }))

    expect(row.outletsUsed).toBe(3)
    expect(row.outletLimit).toBe(1)
    expect(row.isOverOutlets).toBe(true)
  })

  it('flags a branch whose seats are over a lowered allowance', () => {
    const row = rowFor(
      tenant({
        maxStaffPerBranch: 1,
        outletIds: ['makati'],
        staff: [{ outletId: 'makati' }, { outletId: 'makati' }],
      })
    )

    expect(row.peakBranchStaff).toBe(2)
    expect(row.staffLimit).toBe(1)
    expect(row.isOverStaff).toBe(true)
  })

  it('does not treat a full branch as over its allowance', () => {
    // Full is not over. `3 / 3` must not turn the row red, or every healthy
    // store at its plan limit would read as a problem to chase.
    const row = rowFor(
      tenant({
        maxStaffPerBranch: 3,
        outletIds: ['makati'],
        staff: [{ outletId: 'makati' }, { outletId: 'makati' }, { outletId: 'makati' }],
      })
    )

    expect(row.isOverStaff).toBe(false)
  })

  it('ignores staff attached to a branch the tenant no longer has', () => {
    // An orphaned assignment occupies no branch's seats — store-people-card
    // lists those separately for reassignment. Counting them would invent a
    // pool that no longer exists and could flag a healthy store as over.
    const row = rowFor(
      tenant({
        outletIds: ['makati'],
        staff: [
          { outletId: 'makati' },
          { outletId: 'closed-branch' },
          { outletId: 'closed-branch' },
          { outletId: 'closed-branch' },
        ],
      })
    )

    expect(row.peakBranchStaff).toBe(1)
    expect(row.isOverStaff).toBe(false)
  })

  it('reports an empty tenant as zero, not as its default allowance', () => {
    const row = rowFor(tenant())

    expect(row.outletsUsed).toBe(0)
    expect(row.peakBranchStaff).toBe(0)
  })

  it('keeps each tenant to its own counts', () => {
    // Arrange
    const rows = buildAllowanceRows([
      tenant({ tenantId: 'a', outletIds: ['x'], staff: [{ outletId: 'x' }] }),
      tenant({ tenantId: 'b', outletIds: [], staff: [] }),
    ])

    // Assert
    expect(rows.map((r) => r.tenantId)).toEqual(['a', 'b'])
    expect(rows[0].peakBranchStaff).toBe(1)
    expect(rows[1].peakBranchStaff).toBe(0)
  })
})
