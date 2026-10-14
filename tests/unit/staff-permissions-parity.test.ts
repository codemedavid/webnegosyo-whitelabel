import { IMPLIED_BY, OPT_IN_PERMISSION_KEYS, STAFF_PERMISSION_KEYS } from '@/lib/staff-permissions'
import {
  IMPLIED_BY as APP_IMPLIED_BY,
  OPT_IN_PERMISSION_KEYS as APP_OPT_IN_PERMISSION_KEYS,
  hasPermission as appHasPermission,
  STAFF_PERMISSION_KEYS as APP_STAFF_PERMISSION_KEYS,
} from '../../webnegosyo-app/lib/staff-permissions'
import {
  IMPLIED_BY as CORE_IMPLIED_BY,
  OPT_IN_PERMISSION_KEYS as CORE_OPT_IN_PERMISSION_KEYS,
  STAFF_PERMISSION_KEYS as CORE_STAFF_PERMISSION_KEYS,
} from '../../supabase/functions/manage-staff/staff-core'
import {
  IMPLIED_BY as DESKTOP_IMPLIED_BY,
  OPT_IN_PERMISSION_KEYS as DESKTOP_OPT_IN_PERMISSION_KEYS,
  hasPermission as desktopHasPermission,
  STAFF_PERMISSION_KEYS as DESKTOP_STAFF_PERMISSION_KEYS,
} from '../../webnegosyo-desktop/src/renderer/src/lib/staff-permissions'
import { PERMISSION_OPTIONS } from '../../webnegosyo-app/lib/team-roster'

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

  it('keeps the edge-function copy on the same keys, in the same order', () => {
    expect([...CORE_STAFF_PERMISSION_KEYS]).toEqual([...STAFF_PERMISSION_KEYS])
  })

  /**
   * Opt-in keys are the ones `permissions: null` (full access) does NOT grant.
   * A copy that forgot a key would hand "See store activity" to every legacy
   * full-access account on that surface — the exact widening opt-in exists to
   * prevent.
   */
  it('agrees on which keys are opt-in, in all four copies', () => {
    expect([...APP_OPT_IN_PERMISSION_KEYS]).toEqual([...OPT_IN_PERMISSION_KEYS])
    expect([...CORE_OPT_IN_PERMISSION_KEYS]).toEqual([...OPT_IN_PERMISSION_KEYS])
    expect([...DESKTOP_OPT_IN_PERMISSION_KEYS]).toEqual([...OPT_IN_PERMISSION_KEYS])
  })

  it('makes full access stop short of the opt-in keys on the app and the desktop POS', () => {
    const legacy = { role: 'admin', isOwner: false, permissions: null }
    const owner = { role: 'admin', isOwner: true, permissions: null }
    for (const key of OPT_IN_PERMISSION_KEYS) {
      expect(appHasPermission(legacy, key)).toBe(false)
      expect(desktopHasPermission(legacy, key)).toBe(false)
      expect(appHasPermission(owner, key)).toBe(true)
      expect(desktopHasPermission(owner, key)).toBe(true)
    }
    expect(appHasPermission(legacy, 'orders')).toBe(true)
    expect(desktopHasPermission(legacy, 'orders')).toBe(true)
  })

  it('never lists an opt-in key as reachable through containment', () => {
    for (const key of OPT_IN_PERMISSION_KEYS) {
      expect(Object.keys(IMPLIED_BY)).not.toContain(key)
      expect(Object.values(IMPLIED_BY)).not.toContain(key)
    }
  })

  it('gives the app Team picker a label for every key, opt-in ones included', () => {
    expect(PERMISSION_OPTIONS.map((option) => option.key)).toEqual([...STAFF_PERMISSION_KEYS])
    for (const option of PERMISSION_OPTIONS) expect(option.label.trim()).not.toBe('')
  })
})
