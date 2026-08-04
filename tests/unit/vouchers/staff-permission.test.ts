/**
 * Vouchers need their own permission, and all three copies of the registry
 * must agree about it.
 *
 * A voucher is a standing discount on the merchant's own revenue. Bundling it
 * under `menu` would hand it to every staff member who can rename a dish, and
 * bundling it under `settings` would hide it from the manager who actually runs
 * promotions. It gets its own key.
 *
 * The existing parity test guards the web and merchant-app copies but not the
 * desktop register's, which can therefore drift unnoticed — the exact failure
 * that test was written to prevent, one file short.
 */
import { describe, it, expect } from '@jest/globals'
import {
  STAFF_PERMISSION_KEYS,
  STAFF_PERMISSION_LABELS,
  hasPermission,
} from '@/lib/staff-permissions'
import { STAFF_PERMISSION_KEYS as APP_KEYS } from '../../../webnegosyo-app/lib/staff-permissions'
import { STAFF_PERMISSION_KEYS as DESKTOP_KEYS } from '../../../webnegosyo-desktop/src/renderer/src/lib/staff-permissions'

describe('the vouchers permission', () => {
  it('exists as its own key rather than riding on menu or settings', () => {
    expect(STAFF_PERMISSION_KEYS).toContain('vouchers')
  })

  it('is described for the merchant ticking the box', () => {
    const entry = STAFF_PERMISSION_LABELS['vouchers']

    expect(entry?.label).toBeTruthy()
    expect(entry?.description).toBeTruthy()
  })

  it('is withheld from a staff member who was not granted it', () => {
    const staff = { role: 'admin', is_owner: false, permissions: ['orders', 'menu'] }

    expect(hasPermission(staff, 'vouchers')).toBe(false)
    expect(hasPermission(staff, 'orders')).toBe(true)
  })

  it('is granted to the owner without being listed', () => {
    const owner = { role: 'admin', is_owner: true, permissions: [] }

    expect(hasPermission(owner, 'vouchers')).toBe(true)
  })
})

describe('registry parity across all three surfaces', () => {
  it('lists the same keys in the merchant app', () => {
    expect([...APP_KEYS]).toEqual([...STAFF_PERMISSION_KEYS])
  })

  it('lists the same keys in the desktop register', () => {
    // Not covered by the existing parity test, which stops at two copies.
    expect([...DESKTOP_KEYS]).toEqual([...STAFF_PERMISSION_KEYS])
  })
})
