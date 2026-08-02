import {
  DEMOTED_OWNER_PATCH,
  OWNER_PATCH,
  assertCanAddOwner,
  assertNotLastOwner,
  findTenantOwner,
  isTenantOwnerless,
  resolveOwnerTransfer,
  type OwnershipUser,
} from '@/lib/tenant-ownership'

function makeUser(overrides: Partial<OwnershipUser> = {}): OwnershipUser {
  return {
    user_id: 'user_1',
    role: 'admin',
    is_owner: false,
    outlet_id: null,
    ...overrides,
  }
}

const owner = makeUser({ user_id: 'owner_1', is_owner: true })
const admin = makeUser({ user_id: 'admin_1' })
const otherAdmin = makeUser({ user_id: 'admin_2' })

describe('findTenantOwner', () => {
  it('returns the account flagged as owner', () => {
    // Arrange
    const users = [admin, owner, otherAdmin]

    // Act
    const result = findTenantOwner(users)

    // Assert
    expect(result?.user_id).toBe('owner_1')
  })

  it('returns null when no account is flagged as owner', () => {
    expect(findTenantOwner([admin, otherAdmin])).toBeNull()
  })

  it('returns null for an empty tenant', () => {
    expect(findTenantOwner([])).toBeNull()
  })
})

describe('isTenantOwnerless', () => {
  it('is true when admins exist but none of them owns the store', () => {
    expect(isTenantOwnerless([admin, otherAdmin])).toBe(true)
  })

  it('is false when an owner exists', () => {
    expect(isTenantOwnerless([admin, owner])).toBe(false)
  })

  it('is false for a tenant with no accounts at all, which is not yet broken', () => {
    expect(isTenantOwnerless([])).toBe(false)
  })
})

describe('assertCanAddOwner', () => {
  it('throws when the tenant already has an owner', () => {
    expect(() => assertCanAddOwner([owner, admin])).toThrow(/already has an owner/i)
  })

  it('points the caller at ownership transfer instead of a second owner', () => {
    expect(() => assertCanAddOwner([owner])).toThrow(/transfer/i)
  })

  it('allows the first owner of an ownerless tenant', () => {
    expect(() => assertCanAddOwner([admin])).not.toThrow()
  })

  it('allows the first owner of an empty tenant', () => {
    expect(() => assertCanAddOwner([])).not.toThrow()
  })
})

describe('resolveOwnerTransfer', () => {
  it('demotes the sitting owner before promoting the target', () => {
    // Arrange
    const users = [owner, admin]

    // Act
    const transfer = resolveOwnerTransfer(users, 'admin_1')

    // Assert
    expect(transfer).toEqual({ demote: 'owner_1', promote: 'admin_1' })
  })

  it('promotes with nothing to demote when the tenant is ownerless', () => {
    expect(resolveOwnerTransfer([admin, otherAdmin], 'admin_2')).toEqual({
      demote: null,
      promote: 'admin_2',
    })
  })

  it('throws when the target does not belong to the tenant', () => {
    expect(() => resolveOwnerTransfer([owner, admin], 'stranger')).toThrow(/not found/i)
  })

  it('throws when the target already owns the store', () => {
    expect(() => resolveOwnerTransfer([owner, admin], 'owner_1')).toThrow(/already/i)
  })

  it('refuses to hand a store to a superadmin account', () => {
    // Arrange — a platform account listed against the tenant is not a merchant
    const platform = makeUser({ user_id: 'super_1', role: 'superadmin' })

    // Act / Assert
    expect(() => resolveOwnerTransfer([admin, platform], 'super_1')).toThrow(/admin/i)
  })
})

describe('assertNotLastOwner', () => {
  it('refuses to remove the only owner while other admins remain', () => {
    expect(() => assertNotLastOwner([owner, admin], 'owner_1')).toThrow(/owner/i)
  })

  it('allows removing the owner when they are the last account, which closes the store', () => {
    expect(() => assertNotLastOwner([owner], 'owner_1')).not.toThrow()
  })

  it('allows removing a non-owner admin', () => {
    expect(() => assertNotLastOwner([owner, admin], 'admin_1')).not.toThrow()
  })

  it('ignores an unknown user id rather than inventing a rule about it', () => {
    expect(() => assertNotLastOwner([owner, admin], 'stranger')).not.toThrow()
  })
})

describe('ownership row patches', () => {
  it('grants an owner full access', () => {
    expect(OWNER_PATCH).toMatchObject({ is_owner: true, permissions: null })
  })

  it('frees a promoted owner from any branch confinement', () => {
    // The 20260802120000 CHECK constraint permits outlet_id only when
    // is_owner is false, so promoting a branch admin must clear the branch.
    expect(OWNER_PATCH.outlet_id).toBeNull()
  })

  it('leaves a demoted owner as a full-access admin rather than locking them out', () => {
    expect(DEMOTED_OWNER_PATCH).toEqual({ is_owner: false })
  })
})
