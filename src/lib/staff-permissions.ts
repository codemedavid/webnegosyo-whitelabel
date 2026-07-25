// Staff permission registry — the single source of truth for per-feature
// access across the web admin, merchant mobile app, and desktop POS.
// Pure data + lookups only; no I/O, so all three surfaces can port or
// import it directly (same pattern as branding-utils).

export const STAFF_PERMISSION_KEYS = [
  'orders',
  'menu',
  'analytics',
  'store_setup',
  'customers',
  'settings',
  'pos',
] as const

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number]

export const STAFF_PERMISSION_LABELS: Record<
  StaffPermissionKey,
  { label: string; description: string }
> = {
  orders: {
    label: 'Orders',
    description: 'View and manage incoming orders across web, app, and POS',
  },
  menu: {
    label: 'Menu',
    description: 'Manage menu items, categories, and bundles',
  },
  analytics: {
    label: 'Growth & Analytics',
    description: 'Boost sales, product analytics, trends, and growth tools',
  },
  store_setup: {
    label: 'Store Setup',
    description: 'Order types, payment methods, branding, and hero designer',
  },
  customers: {
    label: 'Customers',
    description: 'View and manage the customer list',
  },
  settings: {
    label: 'Settings',
    description: 'Operational settings such as hours, delivery, and Messenger',
  },
  pos: {
    label: 'POS',
    description: 'Take orders at the counter with the desktop POS',
  },
}

export const MAX_STAFF_PER_TENANT = 3

export interface PermissionHolder {
  role: string
  is_owner?: boolean | null
  permissions?: string[] | null
}

/**
 * Whether a user may access a feature area. Owners and superadmins always
 * may; `permissions: null` means full access (backward compatibility with
 * admins created before staff management existed).
 */
export function hasPermission(user: PermissionHolder, key: StaffPermissionKey): boolean {
  if (user.role === 'superadmin' || user.is_owner) return true
  if (user.permissions == null) return true
  return user.permissions.includes(key)
}

/** Only the tenant owner (or a superadmin) may manage staff accounts. */
export function canManageStaff(user: PermissionHolder): boolean {
  return user.role === 'superadmin' || user.is_owner === true
}

/** Whether another staff member can be added given the current staff count. */
export function canAddStaff(currentStaffCount: number): boolean {
  return currentStaffCount < MAX_STAFF_PER_TENANT
}

/**
 * Validates untrusted permission input into a deduplicated list of known
 * keys. Throws with a clear message on anything else.
 */
export function validatePermissionKeys(input: unknown): StaffPermissionKey[] {
  if (!Array.isArray(input)) {
    throw new Error('Permissions must be a list of permission keys')
  }
  const known = new Set<string>(STAFF_PERMISSION_KEYS)
  const result: StaffPermissionKey[] = []
  for (const key of input) {
    if (typeof key !== 'string' || !known.has(key)) {
      throw new Error(`Unknown permission key: ${String(key)}`)
    }
    if (!result.includes(key as StaffPermissionKey)) {
      result.push(key as StaffPermissionKey)
    }
  }
  if (result.length === 0) {
    throw new Error('Select at least one permission')
  }
  return result
}

// Web admin route sections mapped to the permission that gates them.
// Dashboard and settings are intentionally absent: every staff member can
// see the dashboard, and the settings page gates its own sections.
const ADMIN_SECTION_PERMISSIONS: Record<string, StaffPermissionKey> = {
  orders: 'orders',
  menu: 'menu',
  categories: 'menu',
  bundles: 'menu',
  inventory: 'menu',
  'boost-sales': 'analytics',
  'product-analytics': 'analytics',
  'menu-engineering': 'analytics',
  'order-types': 'store_setup',
  'payment-methods': 'store_setup',
  branding: 'store_setup',
  'hero-designer': 'store_setup',
  customers: 'customers',
}

/**
 * The permission gating a web admin pathname (with or without a tenant
 * prefix), or null when the route is open to all staff.
 */
export function permissionForAdminPath(pathname: string): StaffPermissionKey | null {
  const segments = pathname.split('/').filter(Boolean)
  const adminIndex = segments.indexOf('admin')
  if (adminIndex === -1) return null
  const section = segments[adminIndex + 1]
  if (!section) return null
  return ADMIN_SECTION_PERMISSIONS[section] ?? null
}

// Merchant mobile app tab routes (webnegosyo-app app/(main)/*) mapped to
// permissions; null = visible to all staff.
const MOBILE_TAB_PERMISSIONS: Record<string, StaffPermissionKey> = {
  orders: 'orders',
  analytics: 'analytics',
  growth: 'analytics',
  trends: 'analytics',
  'product-analytics': 'analytics',
  'product-management': 'menu',
}

export function permissionForMobileTab(tab: string): StaffPermissionKey | null {
  return MOBILE_TAB_PERMISSIONS[tab] ?? null
}

export type PosScreen = 'pos' | 'orders'

export function permissionForPosScreen(screen: PosScreen): StaffPermissionKey {
  return screen === 'pos' ? 'pos' : 'orders'
}

interface SidebarLikeItem {
  label: string
  href?: string
}

interface SidebarLikeGroup extends SidebarLikeItem {
  children?: SidebarLikeItem[]
}

/**
 * Filters sidebar entries (leaves and groups) down to what the user may
 * access. Groups are kept when at least one child survives. Returns new
 * objects; the input is never mutated.
 */
export function filterSidebarEntriesByPermission<T extends SidebarLikeGroup>(
  entries: T[],
  user: PermissionHolder
): T[] {
  const isAllowed = (href: string | undefined): boolean => {
    if (!href) return true
    const required = permissionForAdminPath(href)
    return required === null || hasPermission(user, required)
  }

  return entries.reduce<T[]>((kept, entry) => {
    if (entry.children) {
      const children = entry.children.filter((child) => isAllowed(child.href))
      if (children.length === 0) return kept
      return [...kept, { ...entry, children }]
    }
    return isAllowed(entry.href) ? [...kept, entry] : kept
  }, [])
}
