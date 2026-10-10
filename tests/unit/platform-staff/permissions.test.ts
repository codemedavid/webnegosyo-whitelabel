import {
  PLATFORM_SECTIONS,
  PLATFORM_SECTION_KEYS,
  canAccessStoreAdmin,
  firstPermittedConsolePath,
  hasPlatformPermission,
  isConsoleUser,
  normalizePlatformPermissions,
  platformPermissionForPath,
} from '@/lib/platform-staff/permissions'

const superadmin = { role: 'superadmin', platform_permissions: null }
const staff = (platform_permissions: string[] | null) => ({ role: 'platform_staff', platform_permissions })
const tenantAdmin = { role: 'admin', tenant_id: 't-1', platform_permissions: null }

describe('normalizePlatformPermissions', () => {
  it('adds the view grant implied by create, edit and delete', () => {
    expect(normalizePlatformPermissions(['tenants.edit'])).toEqual(['tenants.view', 'tenants.edit'])
    expect(normalizePlatformPermissions(['stores.delete'])).toEqual(['stores.view', 'stores.delete'])
  })

  it('dedupes and returns grants in registry order', () => {
    expect(
      normalizePlatformPermissions(['leads.view', 'tenants.view', 'leads.view', 'tenants.create'])
    ).toEqual(['tenants.view', 'tenants.create', 'leads.view'])
  })

  it('rejects unknown sections and malformed keys', () => {
    expect(() => normalizePlatformPermissions(['nope.view'])).toThrow(/Unknown permission/)
    expect(() => normalizePlatformPermissions(['tenants'])).toThrow(/Unknown permission/)
    expect(() => normalizePlatformPermissions([42])).toThrow(/Unknown permission/)
  })

  it('rejects an action the section does not offer', () => {
    // Subscriptions have no create/delete: marking paid is an edit.
    expect(() => normalizePlatformPermissions(['subscriptions.delete'])).toThrow(/not available/)
  })

  it('rejects non-arrays and empty grants', () => {
    expect(() => normalizePlatformPermissions('tenants.view')).toThrow(/list/)
    expect(() => normalizePlatformPermissions([])).toThrow(/at least one/)
  })

  it('never lets team management be granted', () => {
    expect(PLATFORM_SECTION_KEYS).not.toContain('team')
    expect(() => normalizePlatformPermissions(['team.view'])).toThrow(/Unknown permission/)
  })

  it('never lets MCP key creation be granted (a key acts as a full superadmin)', () => {
    expect(PLATFORM_SECTIONS.mcp_keys.actions).not.toContain('create')
    expect(() => normalizePlatformPermissions(['mcp_keys.create'])).toThrow(/not available/)
  })
})

describe('hasPlatformPermission', () => {
  it('grants a superadmin everything', () => {
    expect(hasPlatformPermission(superadmin, 'tenants.delete')).toBe(true)
  })

  it('grants platform staff only what is listed', () => {
    const user = staff(['tenants.view', 'tenants.edit'])
    expect(hasPlatformPermission(user, 'tenants.edit')).toBe(true)
    expect(hasPlatformPermission(user, 'tenants.delete')).toBe(false)
    expect(hasPlatformPermission(user, 'tenants.create')).toBe(false)
  })

  it('treats null permissions on platform staff as NO access (fail closed)', () => {
    expect(hasPlatformPermission(staff(null), 'tenants.view')).toBe(false)
  })

  it('never grants a tenant admin console access', () => {
    expect(hasPlatformPermission(tenantAdmin, 'tenants.view')).toBe(false)
  })
})

describe('isConsoleUser', () => {
  it('admits superadmins and platform staff only', () => {
    expect(isConsoleUser(superadmin)).toBe(true)
    expect(isConsoleUser(staff([]))).toBe(true)
    expect(isConsoleUser(tenantAdmin)).toBe(false)
    expect(isConsoleUser(null)).toBe(false)
  })
})

describe('platformPermissionForPath', () => {
  it.each([
    ['/superadmin', 'overview.view'],
    ['/superadmin/analytics', 'overview.view'],
    ['/superadmin/map', 'overview.view'],
    ['/superadmin/activity', 'overview.view'],
    ['/superadmin/tenants', 'tenants.view'],
    ['/superadmin/tenants/abc', 'tenants.view'],
    ['/superadmin/tenants/new', 'tenants.create'],
    ['/superadmin/restaurants', 'tenants.view'],
    ['/superadmin/leads', 'leads.view'],
    ['/superadmin/checkout-leads', 'checkout_leads.view'],
    ['/superadmin/pipeline', 'checkout_leads.view'],
    ['/superadmin/checkout-leads/payment-methods', 'payment_methods.view'],
    ['/superadmin/subscriptions', 'subscriptions.view'],
    ['/superadmin/whats-new', 'whats_new.view'],
    ['/superadmin/whats-new/new', 'whats_new.create'],
    ['/superadmin/university', 'university.view'],
    ['/superadmin/university/new', 'university.create'],
    ['/superadmin/app-releases', 'app_releases.view'],
    ['/superadmin/mcp-keys', 'mcp_keys.view'],
  ])('%s requires %s', (path, permission) => {
    expect(platformPermissionForPath(path)).toBe(permission)
  })

  it('leaves settings open so every console user can change their own password', () => {
    expect(platformPermissionForPath('/superadmin/settings')).toBeNull()
  })

  it('keeps team management and any unmapped path superadmin-only', () => {
    expect(platformPermissionForPath('/superadmin/team')).toBe('superadmin')
    expect(platformPermissionForPath('/superadmin/something-new')).toBe('superadmin')
  })
})

describe('firstPermittedConsolePath', () => {
  it('sends staff without the overview to their first granted section', () => {
    expect(firstPermittedConsolePath(staff(['leads.view']))).toBe('/superadmin/leads')
  })

  it('falls back to settings when nothing is granted', () => {
    expect(firstPermittedConsolePath(staff([]))).toBe('/superadmin/settings')
  })
})

describe('canAccessStoreAdmin', () => {
  it('lets a superadmin and the store’s own admin do anything', () => {
    expect(canAccessStoreAdmin(superadmin, 't-1', 'delete')).toBe(true)
    expect(canAccessStoreAdmin(tenantAdmin, 't-1', 'delete')).toBe(true)
  })

  it('refuses another store’s admin', () => {
    expect(canAccessStoreAdmin(tenantAdmin, 't-2', 'view')).toBe(false)
  })

  it('holds platform staff to their store-dashboard verbs', () => {
    const viewer = staff(['stores.view', 'stores.edit'])
    expect(canAccessStoreAdmin(viewer, 't-9', 'view')).toBe(true)
    expect(canAccessStoreAdmin(viewer, 't-9', 'edit')).toBe(true)
    expect(canAccessStoreAdmin(viewer, 't-9', 'delete')).toBe(false)
    expect(canAccessStoreAdmin(staff(['tenants.view']), 't-9', 'view')).toBe(false)
  })

  it('refuses a missing user', () => {
    expect(canAccessStoreAdmin(null, 't-1', 'view')).toBe(false)
  })
})

describe('registry', () => {
  it('offers view on every section', () => {
    for (const key of PLATFORM_SECTION_KEYS) {
      expect(PLATFORM_SECTIONS[key].actions).toContain('view')
    }
  })
})
