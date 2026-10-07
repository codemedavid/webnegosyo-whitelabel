import { describe, it, expect } from '@jest/globals'
import {
  buildSettingsCatalog,
  canOpenSettingsSection,
  describeSectionStatus,
  SETTINGS_SECTION_KEYS,
  settingsSectionForPath,
  settingsSectionMeta,
  type SettingsTenantFacts,
  type SettingsViewer,
} from '@/lib/settings/settings-catalog'

const owner = (overrides: Partial<SettingsViewer> = {}): SettingsViewer => ({
  isOwner: true,
  isStoreOwner: true,
  canManageAnyStaff: true,
  isBranchScopedAccount: false,
  hasPermission: () => true,
  ...overrides,
})

const staff = (granted: readonly string[], overrides: Partial<SettingsViewer> = {}): SettingsViewer => ({
  isOwner: false,
  isStoreOwner: false,
  canManageAnyStaff: false,
  isBranchScopedAccount: false,
  hasPermission: (key) => granted.includes(key),
  ...overrides,
})

const store = (overrides: Partial<SettingsTenantFacts> = {}): SettingsTenantFacts => ({
  slug: 'sukad',
  domain: null,
  is_active: true,
  operating_hours: null,
  enforce_operating_hours: false,
  distance_delivery_enabled: false,
  lalamove_enabled: false,
  facebook_page_id: undefined,
  messenger_username: undefined,
  footer_enabled: true,
  flash_screen_feature_enabled: false,
  flash_screen_is_active: false,
  multi_branch_enabled: false,
  ...overrides,
})

const keysOf = (catalog: ReturnType<typeof buildSettingsCatalog>) =>
  catalog.flatMap((group) => group.entries.map((entry) => entry.key))

describe('buildSettingsCatalog — what each viewer is offered', () => {
  it('offers an owner every section and tool their store has switched on', () => {
    const catalog = buildSettingsCatalog({ viewer: owner(), tenant: store(), tenantSlug: 'sukad' })

    expect(keysOf(catalog)).toEqual([
      'store',
      'hours',
      'order-types',
      'payment-methods',
      'delivery',
      'receipts',
      'qr-codes',
      'messenger',
      'connect-ai',
      'branding',
      'hero',
      'footer',
      'team',
      'account',
      'data',
    ])
  })

  it('adds Branches and the splash screen only when the store has those features', () => {
    const catalog = buildSettingsCatalog({
      viewer: owner(),
      tenant: store({ multi_branch_enabled: true, flash_screen_feature_enabled: true }),
      tenantSlug: 'sukad',
    })

    expect(keysOf(catalog)).toEqual(expect.arrayContaining(['branches', 'splash']))
  })

  it('does not offer Branches to an account that runs a single branch', () => {
    const catalog = buildSettingsCatalog({
      viewer: owner({ isOwner: false, isStoreOwner: false, isBranchScopedAccount: true }),
      tenant: store({ multi_branch_enabled: true }),
      tenantSlug: 'sukad',
    })

    expect(keysOf(catalog)).not.toContain('branches')
  })

  it('leaves a staff member without grants only their own account and the read-only store details', () => {
    const catalog = buildSettingsCatalog({ viewer: staff([]), tenant: store(), tenantSlug: 'sukad' })

    expect(keysOf(catalog)).toEqual(['store', 'account'])
  })

  it('gives a staff member with the settings grant the operational sections, not the store-setup tools', () => {
    const keys = keysOf(buildSettingsCatalog({ viewer: staff(['settings']), tenant: store(), tenantSlug: 'sukad' }))

    expect(keys).toEqual(expect.arrayContaining(['hours', 'delivery', 'messenger', 'footer']))
    expect(keys).not.toEqual(expect.arrayContaining(['payment-methods']))
    expect(keys).not.toContain('branding')
    expect(keys).not.toContain('team')
    expect(keys).not.toContain('data')
  })

  it('offers the store-setup tools to a staff member granted store_setup', () => {
    const keys = keysOf(buildSettingsCatalog({ viewer: staff(['store_setup']), tenant: store(), tenantSlug: 'sukad' }))

    expect(keys).toEqual(
      expect.arrayContaining(['order-types', 'payment-methods', 'receipts', 'connect-ai', 'branding', 'hero'])
    )
  })

  it('offers delete orders to the store owner only, never to a superadmin', () => {
    const superadmin = owner({ isStoreOwner: false })

    expect(keysOf(buildSettingsCatalog({ viewer: superadmin, tenant: store(), tenantSlug: 'sukad' }))).not.toContain('data')
  })

  it('drops a group whose entries are all hidden', () => {
    const catalog = buildSettingsCatalog({ viewer: staff([]), tenant: store(), tenantSlug: 'sukad' })

    expect(catalog.map((group) => group.key)).toEqual(['store', 'people'])
  })

  it('prefixes every href with the tenant and marks tools apart from sections', () => {
    const catalog = buildSettingsCatalog({ viewer: owner(), tenant: store(), tenantSlug: 'sukad' })
    const entries = catalog.flatMap((group) => group.entries)
    const hours = entries.find((entry) => entry.key === 'hours')
    const branding = entries.find((entry) => entry.key === 'branding')

    expect(hours).toMatchObject({ kind: 'section', href: '/sukad/admin/settings/hours' })
    expect(branding).toMatchObject({ kind: 'tool', href: '/sukad/admin/branding' })
  })
})

describe('canOpenSettingsSection — the page gate agrees with the catalog', () => {
  it('refuses a section the viewer is not offered', () => {
    expect(canOpenSettingsSection('team', { viewer: staff(['settings']), tenant: store() })).toBe(false)
    expect(canOpenSettingsSection('splash', { viewer: owner(), tenant: store() })).toBe(false)
  })

  it('allows a section the viewer is offered', () => {
    expect(canOpenSettingsSection('hours', { viewer: staff(['settings']), tenant: store() })).toBe(true)
    expect(canOpenSettingsSection('account', { viewer: staff([]), tenant: store() })).toBe(true)
  })

  it('lets a branch admin who manages staff open the team section', () => {
    expect(
      canOpenSettingsSection('team', { viewer: staff([], { canManageAnyStaff: true }), tenant: store() })
    ).toBe(true)
  })
})

describe('describeSectionStatus — the state shown beside each section', () => {
  it('flags opening hours that were never set', () => {
    expect(describeSectionStatus('hours', store(), {})).toEqual({ tone: 'attention', label: 'Not set' })
  })

  it('treats a week where every day is closed as not set', () => {
    const closed = { closed: true, open: '09:00', close: '17:00' }
    expect(describeSectionStatus('hours', store({ operating_hours: { mon: closed, tue: closed } }), {})).toEqual({
      tone: 'attention',
      label: 'Not set',
    })
  })

  it('says when hours are set, and when they also close the shop', () => {
    const open = { mon: { closed: false, open: '09:00', close: '17:00' } }

    expect(describeSectionStatus('hours', store({ operating_hours: open }), {})).toEqual({ tone: 'ok', label: 'Set' })
    expect(
      describeSectionStatus('hours', store({ operating_hours: open, enforce_operating_hours: true }), {})
    ).toEqual({ tone: 'ok', label: 'Closes after hours' })
  })

  it('reads Messenger as connected, username-only, or not connected', () => {
    expect(describeSectionStatus('messenger', store({ facebook_page_id: 'p1' }), {})).toEqual({
      tone: 'ok',
      label: 'Page connected',
    })
    expect(describeSectionStatus('messenger', store({ messenger_username: 'sukadph' }), {})).toEqual({
      tone: 'neutral',
      label: 'Username only',
    })
    expect(describeSectionStatus('messenger', store(), {})).toEqual({ tone: 'attention', label: 'Not connected' })
  })

  it('names what delivery is switched on', () => {
    expect(describeSectionStatus('delivery', store(), {})).toEqual({ tone: 'neutral', label: 'Distance fee off' })
    expect(
      describeSectionStatus('delivery', store({ distance_delivery_enabled: true, lalamove_enabled: true }), {})
    ).toEqual({ tone: 'ok', label: 'Distance fee · Lalamove' })
  })

  it('shows the store as live or offline with its web address', () => {
    expect(describeSectionStatus('store', store({ domain: 'order.sukad.ph' }), {})).toEqual({
      tone: 'ok',
      label: 'Live · order.sukad.ph',
    })
    expect(describeSectionStatus('store', store({ is_active: false }), {})).toEqual({
      tone: 'attention',
      label: 'Offline',
    })
  })

  it('shows the footer and splash screen as on or off', () => {
    expect(describeSectionStatus('footer', store({ footer_enabled: false }), {})).toEqual({ tone: 'off', label: 'Hidden' })
    expect(describeSectionStatus('footer', store({ footer_enabled: undefined }), {})).toEqual({ tone: 'ok', label: 'Shown' })
    expect(describeSectionStatus('splash', store({ flash_screen_is_active: true }), {})).toEqual({ tone: 'ok', label: 'On' })
    expect(describeSectionStatus('splash', store(), {})).toEqual({ tone: 'off', label: 'Off' })
  })

  it('shows the signed-in email on the account section, and nothing when it is unknown', () => {
    expect(describeSectionStatus('account', store(), { accountEmail: 'owner@sukad.ph' })).toEqual({
      tone: 'neutral',
      label: 'owner@sukad.ph',
    })
    expect(describeSectionStatus('account', store(), {})).toBeNull()
  })

  it('has no status for sections whose state lives inside them', () => {
    expect(describeSectionStatus('team', store(), {})).toBeNull()
    expect(describeSectionStatus('data', store(), {})).toBeNull()
  })
})

describe('settingsSectionMeta — every section has a heading', () => {
  it.each(SETTINGS_SECTION_KEYS)('%s has a title and summary', (key) => {
    const meta = settingsSectionMeta(key)

    expect(meta.title.length).toBeGreaterThan(0)
    expect(meta.summary.length).toBeGreaterThan(0)
  })
})

describe('settingsSectionForPath — which rail entry a page belongs to', () => {
  it('maps a section page and its sub-pages to the section', () => {
    expect(settingsSectionForPath('/sukad/admin/settings/hours')).toBe('hours')
    expect(settingsSectionForPath('/sukad/admin/settings/delete-orders')).toBe('data')
  })

  it('returns null for the overview and for unknown paths', () => {
    expect(settingsSectionForPath('/sukad/admin/settings')).toBeNull()
    expect(settingsSectionForPath('/sukad/admin/settings/nope')).toBeNull()
    expect(settingsSectionForPath('/sukad/admin/menu')).toBeNull()
  })
})
