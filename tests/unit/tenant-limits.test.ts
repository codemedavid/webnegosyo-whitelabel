/**
 * How many staff and how many branches a tenant may have.
 *
 * Both numbers used to be facts about the CODE — `MAX_STAFF_PER_TENANT = 3`,
 * and no branch limit at all. They are now facts about the TENANT, so the
 * platform owner can sell a bigger allowance without a deploy.
 *
 * The through-line in every case below: an unset or nonsense limit falls back
 * to what the platform did before, and limits bite on CREATE only. A tenant
 * already over a newly-lowered cap keeps everything it has.
 */

import {
  assertOutletCapacity,
  OutletValidationError,
} from '@/lib/outlets/outlet-repository'
import { DEFAULT_MAX_OUTLETS, DEFAULT_MAX_STAFF_PER_BRANCH } from '@/lib/billing/plan'
import { resolveOutletLimit, resolveStaffLimit } from '@/lib/billing/subscription-status'
import { createStaff, type StaffRecord, type StaffStore } from '@/lib/staff-service'

describe('resolveStaffLimit', () => {
  it('uses the tenant allowance when one is set', () => {
    expect(resolveStaffLimit({ max_staff_per_branch: 10 })).toBe(10)
  })

  it('falls back to the pre-subscription default when unset', () => {
    // Every tenant row predates this column. Reading null as "zero seats" would
    // stop every existing merchant from adding staff the day this ships.
    expect(resolveStaffLimit({ max_staff_per_branch: null })).toBe(DEFAULT_MAX_STAFF_PER_BRANCH)
  })

  it('falls back for a missing tenant entirely', () => {
    expect(resolveStaffLimit(null)).toBe(DEFAULT_MAX_STAFF_PER_BRANCH)
  })

  it('falls back on a negative allowance rather than locking everyone out', () => {
    expect(resolveStaffLimit({ max_staff_per_branch: -1 })).toBe(DEFAULT_MAX_STAFF_PER_BRANCH)
  })

  it('honours a deliberate zero', () => {
    // Zero is a real answer — an owner-only account — and differs from unset.
    expect(resolveStaffLimit({ max_staff_per_branch: 0 })).toBe(0)
  })
})

describe('resolveOutletLimit', () => {
  it('uses the tenant allowance when one is set', () => {
    expect(resolveOutletLimit({ max_outlets: 5 })).toBe(5)
  })

  it('falls back to a single branch when unset', () => {
    expect(resolveOutletLimit({ max_outlets: null })).toBe(DEFAULT_MAX_OUTLETS)
  })
})

describe('assertOutletCapacity', () => {
  it('allows a branch when the tenant is under its allowance', () => {
    expect(() => assertOutletCapacity(2, 3)).not.toThrow()
  })

  it('refuses a branch when the allowance is already used up', () => {
    expect(() => assertOutletCapacity(3, 3)).toThrow(OutletValidationError)
  })

  it('names the allowance in the message so the merchant knows what to ask for', () => {
    // The merchant sees this string verbatim. "Validation failed" would send
    // them to support with nothing useful to say.
    expect(() => assertOutletCapacity(3, 3)).toThrow(/3/)
  })

  it('refuses a tenant already over a lowered allowance', () => {
    expect(() => assertOutletCapacity(7, 3)).toThrow(OutletValidationError)
  })

  it('refuses every branch when the allowance is zero', () => {
    expect(() => assertOutletCapacity(0, 0)).toThrow(OutletValidationError)
  })
})

describe('createStaff seat limit', () => {
  function fakeStore(existing: StaffRecord[]): StaffStore {
    const rows = [...existing]
    return {
      async listStaff() {
        return rows
      },
      async createAuthUser() {
        return { userId: `user-${rows.length + 1}` }
      },
      async insertStaffRow(row) {
        rows.push(row)
      },
      async deleteAuthUser() {},
      async updateAuthPassword() {},
    }
  }

  function staffRow(index: number, outletId: string | null = null): StaffRecord {
    return {
      user_id: `existing-${index}`,
      tenant_id: 'tenant-1',
      role: 'admin',
      is_owner: false,
      outlet_id: outletId,
      permissions: ['orders'],
      display_name: `Staff ${index}`,
      email: `staff${index}@example.com`,
      created_at: '2026-08-01T00:00:00.000Z',
    }
  }

  const newStaff = {
    email: 'new@example.com',
    password: 'password123',
    displayName: 'New Hire',
    permissions: ['orders'],
  }

  it('lets a tenant with a raised allowance exceed the old hard-coded cap', async () => {
    // Three staff used to be the ceiling for everyone. A tenant paying for more
    // seats must actually get them.
    const store = fakeStore([staffRow(1), staffRow(2), staffRow(3)])

    const created = await createStaff(store, 'tenant-1', newStaff, { maxStaffPerBranch: 5 })

    expect(created.email).toBe('new@example.com')
  })

  it('still refuses once the raised allowance is used up', async () => {
    const store = fakeStore([staffRow(1), staffRow(2), staffRow(3), staffRow(4), staffRow(5)])

    await expect(
      createStaff(store, 'tenant-1', newStaff, { maxStaffPerBranch: 5 })
    ).rejects.toThrow(/maximum of 5/)
  })

  it('falls back to the platform default when no allowance is supplied', async () => {
    // Callers that have not been taught about limits yet must behave exactly as
    // they did before, not become unlimited.
    const store = fakeStore([staffRow(1), staffRow(2), staffRow(3)])

    await expect(createStaff(store, 'tenant-1', newStaff, {})).rejects.toThrow(/maximum of 3/)
  })

  it('counts the allowance per branch, not across the whole store', async () => {
    // A five-branch business must not be made to share three logins.
    const store = fakeStore([
      staffRow(1, 'outlet-a'),
      staffRow(2, 'outlet-a'),
      staffRow(3, 'outlet-a'),
    ])

    const created = await createStaff(
      store,
      'tenant-1',
      { ...newStaff, outletId: 'outlet-b' },
      { maxStaffPerBranch: 3, outlets: [{ id: 'outlet-b', tenant_id: 'tenant-1' }] }
    )

    expect(created.outlet_id).toBe('outlet-b')
  })

  it('never counts the owner against the seat allowance', async () => {
    const owner: StaffRecord = { ...staffRow(0), is_owner: true }
    const store = fakeStore([owner, staffRow(1), staffRow(2)])

    const created = await createStaff(store, 'tenant-1', newStaff, { maxStaffPerBranch: 3 })

    expect(created.is_owner).toBe(false)
  })

  it('refuses every hire when the allowance is zero', async () => {
    const store = fakeStore([])

    await expect(
      createStaff(store, 'tenant-1', newStaff, { maxStaffPerBranch: 0 })
    ).rejects.toThrow(/maximum of 0/)
  })
})
