import { DEFAULT_SCREEN_OPTIONS } from '@/lib/staff-default-screen'
import { WORKSPACES } from '../../webnegosyo-app/lib/workspaces'
import { isTabAllowed } from '../../webnegosyo-app/lib/staff-permissions'

/**
 * The web picker offers screens that only the merchant app can actually open.
 *
 * Those are two separate builds with no shared package, so the list of screens
 * lives twice — and the failure mode is silent and delayed: an owner pins a
 * cashier to a screen the app retired, nobody sees an error, and the cashier
 * just keeps landing on the home screen. This test is the only thing that
 * notices, and it notices at the moment the app's tab registry changes rather
 * than months later.
 *
 * It compares against the app's own registry rather than a second hand-written
 * list, so adding a tab to the app is what makes this fail.
 */

const APP_TABS = WORKSPACES.flatMap((workspace) => [...workspace.tabs])

/** A staff account holding exactly the listed grants and nothing else. */
function staffWith(permissions: string[]) {
  return { role: 'admin', isOwner: false, permissions }
}

describe('default-screen registry parity', () => {
  it('offers exactly the tabs the merchant app registers, in the same order', () => {
    expect(DEFAULT_SCREEN_OPTIONS.map((option) => option.tab)).toEqual(APP_TABS)
  })

  it('agrees with the app about which permission each screen needs', () => {
    // Checked through the app's own gate rather than by exporting its internal
    // map: what matters is that the picker's answer and the tab bar's answer
    // are the same answer, not that two tables happen to look alike.
    for (const option of DEFAULT_SCREEN_OPTIONS) {
      const holder = staffWith(option.permission ? [option.permission] : [])
      expect({ tab: option.tab, allowed: isTabAllowed(holder, option.tab) }).toEqual({
        tab: option.tab,
        allowed: true,
      })
    }
  })

  it('marks a screen as ungated only when the app leaves it open to everyone', () => {
    for (const option of DEFAULT_SCREEN_OPTIONS.filter((o) => o.permission === null)) {
      expect({ tab: option.tab, allowed: isTabAllowed(staffWith([]), option.tab) }).toEqual({
        tab: option.tab,
        allowed: true,
      })
    }
  })

  it('marks a screen as gated only when the app actually withholds it', () => {
    for (const option of DEFAULT_SCREEN_OPTIONS.filter((o) => o.permission !== null)) {
      expect({ tab: option.tab, allowed: isTabAllowed(staffWith([]), option.tab) }).toEqual({
        tab: option.tab,
        allowed: false,
      })
    }
  })

  it('assigns every offered screen to the view the app files it under', () => {
    for (const option of DEFAULT_SCREEN_OPTIONS) {
      const owning = WORKSPACES.find((workspace) => workspace.tabs.includes(option.tab))
      expect({ tab: option.tab, view: option.workspace }).toEqual({
        tab: option.tab,
        view: owning?.key,
      })
    }
  })
})
