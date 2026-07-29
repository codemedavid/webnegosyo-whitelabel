import { STAFF_PERMISSION_KEYS } from '@/lib/staff-permissions'
import { STAFF_PERMISSION_KEYS as APP_STAFF_PERMISSION_KEYS } from '../../webnegosyo-app/lib/staff-permissions'

/**
 * The permission registry is duplicated, not shared: the web app and the
 * merchant app are separate builds with no common package. That is a
 * deliberate trade, but it means the two copies can drift silently — and the
 * failure is invisible until a merchant ticks a permission on the web that the
 * app has never heard of, and the app then grants or denies the wrong thing.
 *
 * This test is the only thing standing between the two copies and that drift.
 */
describe('staff permission registry parity', () => {
  it('lists exactly the same permission keys in both packages', () => {
    expect([...APP_STAFF_PERMISSION_KEYS].sort()).toEqual([...STAFF_PERMISSION_KEYS].sort())
  })

  it('lists them in the same order, so the two files stay readable side by side', () => {
    expect([...APP_STAFF_PERMISSION_KEYS]).toEqual([...STAFF_PERMISSION_KEYS])
  })
})
