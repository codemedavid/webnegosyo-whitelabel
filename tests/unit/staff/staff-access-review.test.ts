import {
  reviewDismissKey,
  reviewHref,
  reviewMessage,
  shouldOfferStaffReview,
  staffNeedingReview,
  type StaffReviewRow,
} from '@/lib/staff/staff-access-review'

const TENANT = 'tenant-1'

const row = (overrides: Partial<StaffReviewRow>): StaffReviewRow => ({
  user_id: 'u1',
  role: 'admin',
  is_owner: false,
  permissions: null,
  display_name: 'Ana',
  email: 'ana@example.com',
  ...overrides,
})

describe('staffNeedingReview', () => {
  it('lists staff on legacy full access (permissions NULL)', () => {
    expect(staffNeedingReview([row({})])).toEqual([{ userId: 'u1', name: 'Ana' }])
  })

  it('skips the owner, staff with a chosen list, and non-admin rows', () => {
    const rows = [
      row({ user_id: 'owner', is_owner: true }),
      row({ user_id: 'scoped', permissions: ['orders'] }),
      row({ user_id: 'super', role: 'superadmin' }),
    ]
    expect(staffNeedingReview(rows)).toEqual([])
  })

  it('names an account by its email when it has no display name', () => {
    expect(staffNeedingReview([row({ display_name: '  ', email: 'ben@x.ph' })])).toEqual([
      { userId: 'u1', name: 'ben' },
    ])
    expect(staffNeedingReview([row({ display_name: null, email: null })])).toEqual([
      { userId: 'u1', name: 'A staff member' },
    ])
  })
})

describe('shouldOfferStaffReview', () => {
  it('offers it to the store owner and the platform superadmin only', () => {
    expect(shouldOfferStaffReview({ role: 'admin', is_owner: true, tenant_id: TENANT }, TENANT)).toBe(true)
    expect(shouldOfferStaffReview({ role: 'superadmin', is_owner: false, tenant_id: null }, TENANT)).toBe(true)
    expect(shouldOfferStaffReview({ role: 'admin', is_owner: false, tenant_id: TENANT, permissions: null }, TENANT)).toBe(false)
  })

  it('never offers one store owner a review of another store', () => {
    expect(shouldOfferStaffReview({ role: 'admin', is_owner: true, tenant_id: 'other' }, TENANT)).toBe(false)
  })

  it('offers nothing without a caller', () => {
    expect(shouldOfferStaffReview(null, TENANT)).toBe(false)
  })
})

describe('reviewHref', () => {
  it('opens the one profile when one account needs review', () => {
    expect(reviewHref('acme', [{ userId: 'u1', name: 'Ana' }])).toBe('/acme/admin/staff/u1')
  })

  it('opens the team list when several do', () => {
    expect(
      reviewHref('acme', [
        { userId: 'u1', name: 'Ana' },
        { userId: 'u2', name: 'Ben' },
      ]),
    ).toBe('/acme/admin/staff')
  })

  it('encodes the account id', () => {
    expect(reviewHref('acme', [{ userId: 'a/b', name: 'X' }])).toBe('/acme/admin/staff/a%2Fb')
  })
})

describe('reviewMessage', () => {
  it('names one person', () => {
    expect(reviewMessage([{ userId: 'u1', name: 'Ana' }]).title).toBe('Ana can see everything, including sales and costs')
  })

  it('counts several', () => {
    expect(
      reviewMessage([
        { userId: 'u1', name: 'Ana' },
        { userId: 'u2', name: 'Ben' },
      ]).title,
    ).toBe('2 staff accounts can see everything, including sales and costs')
  })
})

describe('reviewDismissKey', () => {
  it('is per store, so dismissing one store never hides another', () => {
    expect(reviewDismissKey('a')).not.toBe(reviewDismissKey('b'))
  })
})
