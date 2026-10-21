/**
 * The `expenses` key (docs/plans/expenses/contract.md §7).
 *
 * Recording, fixing and voiding expenses moves the store's own money, so it
 * is its own grant: not opt-in (a legacy full-access account holds it, like
 * every other non-opt-in key), and implied by nothing — neither the sales
 * books ('reports') nor ingredient prices ('costs') let anyone spend.
 */
import {
  IMPLIED_BY,
  OPT_IN_PERMISSION_KEYS,
  STAFF_PERMISSION_KEYS,
  STAFF_PERMISSION_LABELS,
  hasPermission,
  permissionForAdminPath,
  permissionForMobileTab,
  validatePermissionKeys,
  type PermissionHolder,
} from '@/lib/staff-permissions'
import { isTabAllowed as appIsTabAllowed } from '../../webnegosyo-app/lib/staff-permissions'

const staff = (permissions: string[] | null): PermissionHolder => ({
  role: 'admin',
  is_owner: false,
  permissions,
})

const appStaff = (permissions: string[] | null) => ({ role: 'admin', isOwner: false, permissions })

describe('the expenses key', () => {
  test('is registered last, with the contract label and description', () => {
    expect(STAFF_PERMISSION_KEYS[STAFF_PERMISSION_KEYS.length - 1]).toBe('expenses')
    expect(STAFF_PERMISSION_LABELS.expenses).toEqual({
      label: 'Expenses',
      description: 'Record, fix and void expenses, manage categories and suppliers, see the expense book.',
    })
    expect(validatePermissionKeys(['expenses'])).toEqual(['expenses'])
  })

  test('is not opt-in: a legacy full-access account holds it', () => {
    expect(OPT_IN_PERMISSION_KEYS).not.toContain('expenses')
    expect(hasPermission(staff(null), 'expenses')).toBe(true)
  })

  test('is implied by nothing and implies nothing', () => {
    expect(IMPLIED_BY.expenses).toBeUndefined()
    expect(Object.values(IMPLIED_BY)).not.toContain('expenses')
    const everythingElse = STAFF_PERMISSION_KEYS.filter((key) => key !== 'expenses')
    expect(hasPermission(staff([...everythingElse]), 'expenses')).toBe(false)
    expect(hasPermission(staff(['expenses']), 'reports')).toBe(false)
    expect(hasPermission(staff(['expenses']), 'costs')).toBe(false)
  })

  test('gates the /admin/expenses section', () => {
    expect(permissionForAdminPath('/acme/admin/expenses')).toBe('expenses')
    expect(permissionForAdminPath('/acme/admin/expenses/new')).toBe('expenses')
  })

  test('gates the app tabs: expenses on expenses, profit on reports (the screen re-checks)', () => {
    expect(permissionForMobileTab('expenses')).toBe('expenses')
    expect(permissionForMobileTab('profit')).toBe('reports')
    expect(appIsTabAllowed(appStaff(['expenses']), 'expenses')).toBe(true)
    expect(appIsTabAllowed(appStaff(['reports']), 'expenses')).toBe(false)
    expect(appIsTabAllowed(appStaff(['reports']), 'profit')).toBe(true)
    expect(appIsTabAllowed(appStaff(['analytics']), 'profit')).toBe(true)
    expect(appIsTabAllowed(appStaff(['expenses', 'costs']), 'profit')).toBe(false)
  })
})
