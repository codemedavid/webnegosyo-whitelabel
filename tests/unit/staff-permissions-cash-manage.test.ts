/**
 * The `cash_manage` key ("Cash & day close", docs/plans/cashier-remittance/CONTRACTS.md §1.3).
 *
 * Setting up drawers, picking up cash from someone else's drawer, closing
 * another person's shift, receiving remittances and closing the business day
 * used to ride `store_setup` (branding, payment methods…). It is now its own
 * grant so an owner can hand a supervisor the cash without the storefront, or
 * a designer the storefront without the cash.
 *
 * - NOT opt-in: a legacy full-access account (`permissions: null`) held cash
 *   management before through `store_setup`, and keeps it.
 * - NOT implied by `store_setup`: the database backfills it once onto every
 *   `store_setup` holder (20261027120100), so nobody loses the drawer screens,
 *   and afterwards the two can be separated. Containment would make that
 *   separation impossible.
 */
import {
  IMPLIED_BY,
  OPT_IN_PERMISSION_KEYS,
  STAFF_PERMISSION_KEYS,
  STAFF_PERMISSION_LABELS,
  hasPermission,
  isGrantedByFullAccess,
  permissionForAdminPath,
  validatePermissionKeys,
  type PermissionHolder,
} from '@/lib/staff-permissions'
import {
  hasPermission as appHasPermission,
  isTabAllowed as appIsTabAllowed,
  STAFF_PERMISSION_KEYS as APP_KEYS,
} from '../../webnegosyo-app/lib/staff-permissions'
import { canManageCash } from '../../webnegosyo-app/lib/cash-drawers'
import { PERMISSION_OPTIONS } from '../../webnegosyo-app/lib/team-roster'
import {
  hasPermission as desktopHasPermission,
  STAFF_PERMISSION_KEYS as DESKTOP_KEYS,
} from '../../webnegosyo-desktop/src/renderer/src/lib/staff-permissions'
import {
  STAFF_PERMISSION_KEYS as CORE_KEYS,
  validatePermissionKeys as coreValidatePermissionKeys,
} from '../../supabase/functions/manage-staff/staff-core'

const staff = (permissions: string[] | null): PermissionHolder => ({
  role: 'admin',
  is_owner: false,
  permissions,
})

const appStaff = (permissions: string[] | null) => ({ role: 'admin', isOwner: false, permissions })

describe('the cash_manage key', () => {
  test('is registered with the contract label and description', () => {
    expect(STAFF_PERMISSION_KEYS).toContain('cash_manage')
    expect(STAFF_PERMISSION_LABELS.cash_manage).toEqual({
      label: 'Cash & day close',
      description:
        "Set up cash drawers, pick up cash, close others' shifts, receive remittances, close the business day and see that day's sales. Give it to supervisors you trust with cash.",
    })
    expect(validatePermissionKeys(['cash_manage'])).toEqual(['cash_manage'])
  })

  test('is known to every surface, so saving it on one is never refused by another', () => {
    expect(APP_KEYS).toContain('cash_manage')
    expect(DESKTOP_KEYS).toContain('cash_manage')
    expect(CORE_KEYS).toContain('cash_manage')
    // The edge function is the production writer: an unknown key there blocks
    // the owner from saving the account at all.
    expect(coreValidatePermissionKeys(['pos', 'cash_manage'])).toEqual(['pos', 'cash_manage'])
  })

  test('is opt-in (release review D1): legacy full access does not hold it, the owner ticks it by name', () => {
    expect(OPT_IN_PERMISSION_KEYS).toContain('cash_manage')
    expect(isGrantedByFullAccess('cash_manage')).toBe(false)
    expect(hasPermission(staff(null), 'cash_manage')).toBe(false)
    expect(appHasPermission(appStaff(null), 'cash_manage')).toBe(false)
    expect(desktopHasPermission(appStaff(null), 'cash_manage')).toBe(false)
  })

  test('is implied by nothing — store_setup holders get it from the one-time backfill, not containment', () => {
    expect(IMPLIED_BY.cash_manage).toBeUndefined()
    expect(Object.values(IMPLIED_BY)).not.toContain('cash_manage')
    expect(hasPermission(staff(['store_setup']), 'cash_manage')).toBe(false)
    expect(hasPermission(staff(['pos', 'orders', 'reports']), 'cash_manage')).toBe(false)
    expect(hasPermission(staff(['cash_manage']), 'cash_manage')).toBe(true)
    // …and it opens nothing else: cash is not the storefront or the books.
    expect(hasPermission(staff(['cash_manage']), 'store_setup')).toBe(false)
    expect(hasPermission(staff(['cash_manage']), 'reports')).toBe(false)
  })

  test('gates the web /admin/cash section', () => {
    expect(permissionForAdminPath('/acme/admin/cash')).toBe('cash_manage')
    expect(permissionForAdminPath('/acme/admin/cash/shifts')).toBe('cash_manage')
    expect(permissionForAdminPath('/admin/cash')).toBe('cash_manage')
  })

  test('gates the app cash-manager screens; Shift & remit rules also open to settings (the cutoff)', () => {
    for (const tab of ['cash-drawers', 'remittances', 'day-close']) {
      expect({ tab, allowed: appIsTabAllowed(appStaff(['cash_manage']), tab) }).toEqual({ tab, allowed: true })
      expect({ tab, allowed: appIsTabAllowed(appStaff(['pos', 'store_setup']), tab) }).toEqual({ tab, allowed: false })
    }
    expect(appIsTabAllowed(appStaff(['cash_manage']), 'cash-rules')).toBe(true)
    expect(appIsTabAllowed(appStaff(['settings']), 'cash-rules')).toBe(true)
    expect(appIsTabAllowed(appStaff(['pos', 'store_setup']), 'cash-rules')).toBe(false)
    // A cashier's own shift report is not a manager screen: the server decides.
    expect(appIsTabAllowed(appStaff(['pos']), 'shift-sales')).toBe(true)
  })

  test('labels the key on the app Team picker', () => {
    const option = PERMISSION_OPTIONS.find((o) => o.key === 'cash_manage')
    expect(option?.label).toBe('Cash & day close')
    // Same words on the web and the app picker: the key includes the day's sales
    // (report_shift_sales and the day close show them to cash managers).
    expect(option?.description).toBe(STAFF_PERMISSION_LABELS.cash_manage.description)
    expect(option?.description).toContain("see that day's sales")
  })
})

describe('canManageCash (merchant app)', () => {
  test('is the cash_manage key: owners and superadmins yes, legacy full access no (opt-in)', () => {
    expect(canManageCash({ role: 'admin', isOwner: true, permissions: [] })).toBe(true)
    expect(canManageCash({ role: 'superadmin', isOwner: false, permissions: [] })).toBe(true)
    expect(canManageCash(appStaff(null))).toBe(false)
    expect(canManageCash(appStaff(['pos', 'cash_manage']))).toBe(true)
  })

  test('no longer rides store_setup: a storefront designer does not hold the cash', () => {
    expect(canManageCash(appStaff(['pos', 'store_setup']))).toBe(false)
    expect(canManageCash(appStaff(['pos', 'orders']))).toBe(false)
  })
})
