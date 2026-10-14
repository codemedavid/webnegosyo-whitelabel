import {
  IMPLIED_BY,
  ORDER_READ_KEYS,
  PAYMENT_READ_KEYS,
  STAFF_PERMISSION_KEYS,
  permissionForMobileTab,
} from '@/lib/staff-permissions'
import {
  IMPLIED_BY as APP_IMPLIED_BY,
  ORDER_READ_KEYS as APP_ORDER_READ_KEYS,
  PAYMENT_READ_KEYS as APP_PAYMENT_READ_KEYS,
  STAFF_PERMISSION_KEYS as APP_STAFF_PERMISSION_KEYS,
  isTabAllowed as appIsTabAllowed,
} from '../../webnegosyo-app/lib/staff-permissions'
import { WORKSPACES as APP_WORKSPACES } from '../../webnegosyo-app/lib/workspaces'
import { IMPLIED_BY as CORE_IMPLIED_BY } from '../../supabase/functions/manage-staff/staff-core'
import {
  IMPLIED_BY as DESKTOP_IMPLIED_BY,
  STAFF_PERMISSION_KEYS as DESKTOP_STAFF_PERMISSION_KEYS,
} from '../../webnegosyo-desktop/src/renderer/src/lib/staff-permissions'

/**
 * The permission registry is duplicated, not shared: the web admin, the
 * merchant app, the manage-staff edge function and the desktop POS are four
 * separate builds with no common package. That is a deliberate trade, but it
 * means the copies can drift silently — and the failure is invisible until a
 * merchant ticks a permission on the web that another surface has never heard
 * of, and that surface then grants or denies the wrong thing.
 *
 * This test is the only thing standing between the four copies and that drift.
 */
describe('staff permission registry parity', () => {
  it('lists exactly the same permission keys in both packages', () => {
    expect([...APP_STAFF_PERMISSION_KEYS].sort()).toEqual([...STAFF_PERMISSION_KEYS].sort())
  })

  it('lists them in the same order, so the two files stay readable side by side', () => {
    expect([...APP_STAFF_PERMISSION_KEYS]).toEqual([...STAFF_PERMISSION_KEYS])
  })

  /**
   * The desktop POS holds a fourth copy. It was left out of this test once
   * before and fell a whole key behind ('branch_staff') without anything
   * failing; the comment at the top of that file is the scar.
   */
  it('keeps the desktop POS copy on the same keys, in the same order', () => {
    expect([...DESKTOP_STAFF_PERMISSION_KEYS]).toEqual([...STAFF_PERMISSION_KEYS])
  })

  /**
   * Containment decides what a staff account can open without the key being
   * ticked. A copy that disagrees hands one surface a screen another refuses,
   * which is the same silent failure the key list above guards against.
   */
  it('agrees on which grants contain which, in all four copies', () => {
    expect(APP_IMPLIED_BY).toEqual(IMPLIED_BY)
    expect(CORE_IMPLIED_BY).toEqual(IMPLIED_BY)
    expect(DESKTOP_IMPLIED_BY).toEqual(IMPLIED_BY)
  })

  /**
   * The database refuses orders (and the money taken on them) to an account
   * holding none of these keys. The phone decides from its own copy whether to
   * ask at all; a copy that is wider would ask, be refused silently, and show
   * the merchant ₱0 and an empty queue.
   */
  it('agrees with the merchant app on who may read orders and payments', () => {
    expect([...APP_ORDER_READ_KEYS]).toEqual([...ORDER_READ_KEYS])
    expect([...APP_PAYMENT_READ_KEYS]).toEqual([...PAYMENT_READ_KEYS])
  })

  /**
   * The web's copy of the app's tab map names only some tabs. Each one it does
   * name must be the grant the app itself asks for — the stock screen and its
   * priced report moved off 'menu', and a stale copy would describe the old rule.
   */
  it('names the same grant as the merchant app for every app tab it maps', () => {
    const mapped = APP_WORKSPACES.flatMap((w) => [...w.tabs]).filter(
      (tab) => permissionForMobileTab(tab) !== null
    )
    expect(mapped).toEqual(expect.arrayContaining(['inventory', 'daily-report']))
    for (const tab of mapped) {
      const key = permissionForMobileTab(tab) as string
      const holder = { role: 'admin', isOwner: false, permissions: [key] }
      expect({ tab, allowed: appIsTabAllowed(holder, tab) }).toEqual({ tab, allowed: true })
      const nobody = { role: 'admin', isOwner: false, permissions: [] }
      expect({ tab, allowed: appIsTabAllowed(nobody, tab) }).toEqual({ tab, allowed: false })
    }
    expect(permissionForMobileTab('inventory')).toBe('inventory')
    expect(permissionForMobileTab('daily-report')).toBe('costs')
  })
})
