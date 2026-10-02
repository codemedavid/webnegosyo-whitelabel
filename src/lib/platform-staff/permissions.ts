// Platform staff permission registry — the single source of truth for what a
// limited console account (`app_users.role = 'platform_staff'`) may do.
//
// A superadmin passes every check. A platform staff account passes only the
// `section.action` grants listed in `app_users.platform_permissions`; a NULL
// list means NO access (fail closed), the opposite of tenant staff, where NULL
// predates staff management and means "everything".
//
// The database enforces the store-dashboard verbs independently through the
// `app_user_platform_can()` RLS policies (migration 20260929180000), so hiding
// a button here is never the only thing standing between a viewer and a delete.
//
// Pure data + lookups only; no I/O, so middleware (edge), server and client
// code can all import it.

export const PLATFORM_ACTIONS = ['view', 'create', 'edit', 'delete'] as const
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number]

export interface PlatformSection {
  label: string
  description: string
  /** The verbs this section offers. `view` is always first. */
  actions: readonly PlatformAction[]
  /** What each verb means here, for the permission picker. */
  actionHints?: Partial<Record<PlatformAction, string>>
  /** Console landing path, used to route staff to a section they can open. */
  path: string
}

export const PLATFORM_SECTIONS = {
  overview: {
    label: 'Dashboard & analytics',
    description: 'Platform dashboard, analytics, store activity and the client map.',
    actions: ['view'],
    path: '/superadmin',
  },
  tenants: {
    label: 'Restaurants',
    description: 'The restaurant list and each restaurant’s platform settings.',
    actions: ['view', 'create', 'edit', 'delete'],
    actionHints: {
      edit: 'Change details, feature flags, deploys and integrations',
      delete: 'Deactivate or permanently delete restaurants',
    },
    path: '/superadmin/tenants',
  },
  tenant_users: {
    label: 'Store logins',
    description: 'The admin accounts that sign in to each restaurant.',
    actions: ['view', 'create', 'edit', 'delete'],
    actionHints: { edit: 'Hand ownership to another login' },
    path: '/superadmin/tenants',
  },
  stores: {
    label: 'Store dashboards',
    description: 'Open a restaurant’s own admin (menu, orders, settings) on its behalf.',
    actions: ['view', 'create', 'edit', 'delete'],
    actionHints: {
      view: 'Open store dashboards read-only',
      create: 'Add menu items, categories, vouchers…',
      edit: 'Change existing store data',
      delete: 'Remove store data',
    },
    path: '/superadmin/tenants',
  },
  subscriptions: {
    label: 'Subscriptions',
    description: 'Billing status for every restaurant.',
    actions: ['view', 'edit'],
    actionHints: { edit: 'Mark paid, pause, change billing date and limits' },
    path: '/superadmin/subscriptions',
  },
  leads: {
    label: 'Leads',
    description: 'The sales lead pipeline.',
    actions: ['view', 'create', 'edit'],
    actionHints: { create: 'Add notes', edit: 'Change lead status' },
    path: '/superadmin/leads',
  },
  checkout_leads: {
    label: 'Checkout leads',
    description: 'Platform sign-ups waiting for payment.',
    actions: ['view', 'edit'],
    actionHints: { edit: 'Change sign-up status' },
    path: '/superadmin/checkout-leads',
  },
  payment_methods: {
    label: 'Sign-up payment methods',
    description: 'How new merchants pay for the platform.',
    actions: ['view', 'create', 'edit', 'delete'],
    path: '/superadmin/checkout-leads/payment-methods',
  },
  whats_new: {
    label: 'What’s New',
    description: 'Announcements sent to merchants.',
    actions: ['view', 'create', 'edit', 'delete'],
    actionHints: { edit: 'Edit, publish and send push notifications' },
    path: '/superadmin/whats-new',
  },
  university: {
    label: 'University',
    description: 'Training courses for merchants.',
    actions: ['view', 'create', 'edit', 'delete'],
    path: '/superadmin/university',
  },
  app_releases: {
    label: 'App releases',
    description: 'Merchant app release notes and version gates.',
    actions: ['view', 'edit'],
    path: '/superadmin/app-releases',
  },
  mcp_keys: {
    label: 'MCP keys',
    description: 'API keys for the SmartMenu MCP.',
    // No `create`: a platform key acts as a full superadmin (the MCP surface
    // writes through the service role and can create store owners), so only a
    // superadmin may mint one — see createMcpKeyAction.
    actions: ['view', 'delete'],
    actionHints: { delete: 'Revoke keys' },
    path: '/superadmin/mcp-keys',
  },
  settings: {
    label: 'Platform settings',
    description: 'Integration status and preset tags.',
    actions: ['view', 'edit'],
    actionHints: { edit: 'Add and remove preset tags' },
    path: '/superadmin/settings',
  },
} as const satisfies Record<string, PlatformSection>

export type PlatformSectionKey = keyof typeof PLATFORM_SECTIONS
export type PlatformPermission = `${PlatformSectionKey}.${PlatformAction}`

export const PLATFORM_SECTION_KEYS = Object.keys(PLATFORM_SECTIONS) as PlatformSectionKey[]

export interface PlatformPermissionHolder {
  role: string
  platform_permissions?: string[] | null
}

export interface StoreAccessHolder extends PlatformPermissionHolder {
  tenant_id?: string | null
}

export function platformPermission(
  section: PlatformSectionKey,
  action: PlatformAction
): PlatformPermission {
  return `${section}.${action}`
}

function parsePermission(value: unknown): { section: PlatformSectionKey; action: PlatformAction } | null {
  if (typeof value !== 'string') return null
  const [section, action, ...rest] = value.split('.')
  if (rest.length > 0 || !section || !action) return null
  if (!(section in PLATFORM_SECTIONS)) return null
  if (!(PLATFORM_ACTIONS as readonly string[]).includes(action)) return null
  return { section: section as PlatformSectionKey, action: action as PlatformAction }
}

/**
 * Validates untrusted grant input: known sections, actions the section offers,
 * deduplicated, with the `view` every other verb depends on added. Returned in
 * registry order so stored lists diff cleanly. Throws on anything else.
 */
export function normalizePlatformPermissions(input: unknown): PlatformPermission[] {
  if (!Array.isArray(input)) {
    throw new Error('Permissions must be a list of permission keys')
  }

  const granted = new Set<PlatformPermission>()
  for (const value of input) {
    const parsed = parsePermission(value)
    if (!parsed) throw new Error(`Unknown permission: ${String(value)}`)

    const offered: readonly PlatformAction[] = PLATFORM_SECTIONS[parsed.section].actions
    if (!offered.includes(parsed.action)) {
      throw new Error(`"${parsed.action}" is not available for ${PLATFORM_SECTIONS[parsed.section].label}`)
    }
    granted.add(platformPermission(parsed.section, parsed.action))
    granted.add(platformPermission(parsed.section, 'view'))
  }

  if (granted.size === 0) {
    throw new Error('Select at least one permission')
  }

  return PLATFORM_SECTION_KEYS.flatMap((section) =>
    PLATFORM_SECTIONS[section].actions
      .map((action) => platformPermission(section, action))
      .filter((permission) => granted.has(permission))
  )
}

/** Superadmins and platform staff — the accounts the console admits at all. */
export function isConsoleUser(user: PlatformPermissionHolder | null | undefined): boolean {
  return user?.role === 'superadmin' || user?.role === 'platform_staff'
}

export function hasPlatformPermission(
  user: PlatformPermissionHolder | null | undefined,
  permission: PlatformPermission
): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  if (user.role !== 'platform_staff') return false
  return (user.platform_permissions ?? []).includes(permission)
}

/**
 * Whether the user may act on one restaurant's own admin. The restaurant's own
 * admins and superadmins may do anything their other checks allow; platform
 * staff are held to their `stores.*` verbs.
 */
export function canAccessStoreAdmin(
  user: StoreAccessHolder | null | undefined,
  tenantId: string,
  action: PlatformAction
): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  if (user.role === 'admin') return user.tenant_id === tenantId
  return hasPlatformPermission(user, platformPermission('stores', action))
}

/** `'superadmin'` marks a console path no staff grant can open. */
export type ConsolePathRequirement = PlatformPermission | 'superadmin' | null

// Longest prefix first; the first match wins. Anything under /superadmin that
// is not listed is superadmin-only, so a new console page is closed to staff
// until someone decides who should see it.
const CONSOLE_PATH_RULES: ReadonlyArray<readonly [string, ConsolePathRequirement]> = [
  ['/superadmin/checkout-leads/payment-methods', 'payment_methods.view'],
  ['/superadmin/checkout-leads', 'checkout_leads.view'],
  ['/superadmin/tenants/new', 'tenants.create'],
  ['/superadmin/tenants', 'tenants.view'],
  ['/superadmin/restaurants', 'tenants.view'],
  ['/superadmin/analytics', 'overview.view'],
  ['/superadmin/activity', 'overview.view'],
  ['/superadmin/map', 'overview.view'],
  ['/superadmin/leads', 'leads.view'],
  ['/superadmin/subscriptions', 'subscriptions.view'],
  ['/superadmin/whats-new/new', 'whats_new.create'],
  ['/superadmin/whats-new', 'whats_new.view'],
  ['/superadmin/university/new', 'university.create'],
  ['/superadmin/university', 'university.view'],
  ['/superadmin/app-releases', 'app_releases.view'],
  ['/superadmin/mcp-keys', 'mcp_keys.view'],
  // Open to every console user: it is where they change their own password.
  // The platform sections on it gate themselves on `settings.*`.
  ['/superadmin/settings', null],
]

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** What a console pathname requires of the caller. */
export function platformPermissionForPath(pathname: string): ConsolePathRequirement {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/superadmin') return 'overview.view'
  const rule = CONSOLE_PATH_RULES.find(([prefix]) => matchesPrefix(path, prefix))
  return rule ? rule[1] : 'superadmin'
}

export function canOpenConsolePath(
  user: PlatformPermissionHolder | null | undefined,
  pathname: string
): boolean {
  if (!isConsoleUser(user)) return false
  const required = platformPermissionForPath(pathname)
  if (required === null) return true
  if (required === 'superadmin') return user?.role === 'superadmin'
  return hasPlatformPermission(user, required)
}

/** Where to send a console user who may not open the dashboard. */
export function firstPermittedConsolePath(user: PlatformPermissionHolder): string {
  const section = PLATFORM_SECTION_KEYS.find((key) =>
    hasPlatformPermission(user, platformPermission(key, 'view'))
  )
  return section ? PLATFORM_SECTIONS[section].path : '/superadmin/settings'
}
