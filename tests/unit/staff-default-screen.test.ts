import {
  DEFAULT_SCREEN_OPTIONS,
  selectableDefaultScreens,
  validateDefaultTab,
} from '@/lib/staff-default-screen'

/**
 * The screens an owner may pin a staff account to.
 *
 * Two things are being guarded. The first is that the picker never offers a
 * screen the account cannot open — an owner who sets one would be configuring
 * a redirect that silently does nothing, which reads as a broken setting.
 * The second is `validateDefaultTab`: the column is free text, and it is
 * written from a form and read months later by a different codebase, so
 * anything can arrive at it.
 */

const CASHIER = ['pos']
const FULL_ACCESS = null

describe('DEFAULT_SCREEN_OPTIONS', () => {
  it('names every screen it offers', () => {
    for (const option of DEFAULT_SCREEN_OPTIONS) {
      expect(option.tab.length).toBeGreaterThan(0)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('offers each screen exactly once', () => {
    const tabs = DEFAULT_SCREEN_OPTIONS.map((option) => option.tab)
    expect(new Set(tabs).size).toBe(tabs.length)
  })
})

describe('selectableDefaultScreens', () => {
  it('offers a cashier the register but not the analytics they cannot open', () => {
    const offered = selectableDefaultScreens({ permissions: CASHIER }).map((o) => o.tab)

    expect(offered).toContain('pos')
    expect(offered).not.toContain('analytics')
  })

  it('offers an owner every screen', () => {
    const offered = selectableDefaultScreens({ permissions: FULL_ACCESS })
    expect(offered).toHaveLength(DEFAULT_SCREEN_OPTIONS.length)
  })

  it('offers the ungated screens to a staff member holding nothing yet', () => {
    // An add-staff form starts with no permissions ticked. The home screen is
    // open to everyone, so the picker must not come up empty.
    const offered = selectableDefaultScreens({ permissions: [] }).map((o) => o.tab)

    expect(offered).toContain('dashboard')
    expect(offered).not.toContain('orders')
  })

  it('hides the branch screens from an account confined to one branch', () => {
    // Those screens compare branches; a manager has only theirs.
    const offered = selectableDefaultScreens({
      permissions: FULL_ACCESS,
      isBranchScoped: true,
    }).map((o) => o.tab)

    expect(offered).not.toContain('portfolio')
    expect(offered).toContain('orders')
  })

  it('hides the branch screens from a single-location store', () => {
    const offered = selectableDefaultScreens({
      permissions: FULL_ACCESS,
      branchCount: 1,
    }).map((o) => o.tab)

    expect(offered).not.toContain('portfolio')
  })

  it('offers the branch screens to a store-wide account once branches exist', () => {
    const offered = selectableDefaultScreens({
      permissions: FULL_ACCESS,
      branchCount: 3,
    }).map((o) => o.tab)

    expect(offered).toContain('portfolio')
  })
})

describe('validateDefaultTab', () => {
  it('accepts a screen the account may open', () => {
    expect(validateDefaultTab('pos', CASHIER)).toBe('pos')
  })

  it('rejects a screen the account has no permission for', () => {
    expect(validateDefaultTab('analytics', CASHIER)).toBeNull()
  })

  it('rejects a screen the app does not have', () => {
    expect(validateDefaultTab('reports-v1', FULL_ACCESS)).toBeNull()
  })

  it('reads an empty choice as no choice', () => {
    expect(validateDefaultTab('', FULL_ACCESS)).toBeNull()
    expect(validateDefaultTab('   ', FULL_ACCESS)).toBeNull()
  })

  it('rejects anything that is not a string', () => {
    // The value crosses a server-action boundary, so it is untyped in practice.
    expect(validateDefaultTab(null, FULL_ACCESS)).toBeNull()
    expect(validateDefaultTab(undefined, FULL_ACCESS)).toBeNull()
    expect(validateDefaultTab(42, FULL_ACCESS)).toBeNull()
    expect(validateDefaultTab(['pos'], FULL_ACCESS)).toBeNull()
    expect(validateDefaultTab({ tab: 'pos' }, FULL_ACCESS)).toBeNull()
  })

  it('trims a padded value rather than rejecting it', () => {
    expect(validateDefaultTab(' pos ', CASHIER)).toBe('pos')
  })
})
