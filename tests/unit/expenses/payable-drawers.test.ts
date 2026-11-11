import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { listPayableDrawers, payableDrawerLabel } from '@/lib/expenses/read/payable-drawers'

const TENANT = 'tenant-a'
const ME = 'user-me'

function shift(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: TENANT,
    outlet_id: 'outlet-1',
    staff_user_id: `user-${id}`,
    staff_name: id,
    drawer_name: null,
    status: 'open',
    opened_at: '2026-10-26T00:00:00Z',
    ...overrides,
  }
}

const rows = [
  shift('Ana', { drawer_name: 'Cashier 2' }),
  shift('Ben', { drawer_name: 'Cashier 1', opened_at: '2026-10-26T01:00:00Z' }),
  shift('Cy'),
  shift('Me', { staff_user_id: ME, drawer_name: 'Front till' }),
  shift('Gone', { status: 'closed' }),
  shift('Other store', { tenant_id: 'tenant-b' }),
]

describe('listPayableDrawers', () => {
  it('offers a cash manager every open drawer of the store: theirs first, then tills, then personal drawers', async () => {
    // Arrange
    const fake = fakeSupabaseTables({ staff_shifts: rows })

    // Act
    const drawers = await listPayableDrawers(fake.client, { tenantId: TENANT, userId: ME, managesCash: true })

    // Assert
    expect(drawers.map((drawer) => [drawer.staffName, drawer.isMine])).toEqual([
      ['Me', true],
      ['Ben', false],
      ['Ana', false],
      ['Cy', false],
    ])
    expect(drawers[1]).toEqual({ shiftId: 'Ben', drawerName: 'Cashier 1', staffName: 'Ben', isMine: false, outletId: 'outlet-1', openedAt: '2026-10-26T01:00:00Z' })
  })

  it('offers anyone else only their own open drawer', async () => {
    const fake = fakeSupabaseTables({ staff_shifts: rows })
    const drawers = await listPayableDrawers(fake.client, { tenantId: TENANT, userId: ME, managesCash: false })
    expect(drawers.map((drawer) => drawer.shiftId)).toEqual(['Me'])
  })

  it('says so when the drawers cannot be read (the form then offers none)', async () => {
    const fake = fakeSupabaseTables({}, { staff_shifts: 'permission denied for table staff_shifts' })
    await expect(listPayableDrawers(fake.client, { tenantId: TENANT, userId: ME, managesCash: true })).rejects.toThrow('permission denied')
  })
})

describe('payableDrawerLabel', () => {
  it('names the till and who holds it', () => {
    expect(payableDrawerLabel({ drawerName: 'Cashier 1', staffName: 'Ana', isMine: false })).toBe('Cashier 1 · Ana')
    expect(payableDrawerLabel({ drawerName: null, staffName: 'Ana', isMine: false })).toBe("Ana's drawer")
    expect(payableDrawerLabel({ drawerName: 'Cashier 1', staffName: 'Me', isMine: true })).toBe('Cashier 1 · You')
    expect(payableDrawerLabel({ drawerName: null, staffName: 'Me', isMine: true })).toBe('Your drawer')
  })
})
