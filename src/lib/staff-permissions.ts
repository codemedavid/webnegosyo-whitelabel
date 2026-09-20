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
  'branch_staff',
  'order_edit',
  'order_refund',
  'vouchers',
  // The kitchen display — sees every active ticket and bumps orders to ready.
  // Its own key (not 'orders') so a cook's tablet can show the board without
  // also granting the full order queue, payments, and cancellations.
  'kitchen',
  // The floor plan — seats parties, clears tables, and shows each table's
  // open orders and bill. Its own key (not 'orders') so a host stand can run
  // the floor without the full order queue, payments, and cancellations.
  'tables',
  // Loyalty programs: creating one, changing its rules, pausing it, and
  // correcting a customer's balance. Its own key rather than 'customers'
  // because a balance correction moves value, and 'vouchers' because a staffer
  // who may retire a promo code should not be able to rewrite every regular's
  // stamp card. Attaching a customer at the register needs no grant.
  'loyalty_manage',
  'loyalty_redeem',
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
  branch_staff: {
    label: 'Branch Staff',
    description: 'Add and manage staff accounts for their own branch only',
  },
  order_edit: {
    label: 'Edit Orders',
    description: 'Change the items on a placed order and settle the difference',
  },
  order_refund: {
    label: 'Issue Refunds',
    description: 'Return money on an edited order — grant sparingly',
  },
  vouchers: {
    label: 'Vouchers & Discounts',
    description: 'Create and retire discount codes — grant sparingly',
  },
  kitchen: {
    label: 'Kitchen Display',
    description: 'See active tickets on the kitchen display and mark them ready',
  },
  tables: {
    label: 'Tables',
    description: 'See the floor plan, seat parties and clear tables',
  },
  loyalty_manage: {
    label: 'Loyalty Programs',
    description: 'Create and change loyalty programs and correct balances — grant sparingly',
  },
  loyalty_redeem: {
    label: 'Redeem Loyalty Rewards',
    description: 'Apply verified customer rewards at POS without access to customer history',
  },
}

export const MAX_STAFF_PER_TENANT = 3

/**
 * Grants a broader grant already contains: key -> the grant that includes it.
 *
 * A staff account's permission list is a snapshot of the keys that existed the
 * day it was written. So a key carved OUT of an existing grant takes its
 * screen away from every account already holding the parent — the merchant
 * ships a feature and their team silently cannot see it, with nothing on
 * screen to say why. `kitchen` and `tables` were both carved out of `orders`
 * for exactly that reason (see the registry comments above): the pass and the
 * floor are the live order queue seen from one station, minus the queue's
 * payments and cancellations. Anyone holding `orders` could already do strictly
 * more, so naming the containment here restores them without widening anyone.
 *
 * Only strict subsets belong here. A grant that can do something its parent
 * cannot — a refund, a loyalty balance, another person's account — is a
 * separate authority and stays opt-in, however adjacent it looks.
 */
export const IMPLIED_BY: Readonly<Partial<Record<StaffPermissionKey, StaffPermissionKey>>> = {
  kitchen: 'orders',
  tables: 'orders',
}

/** Whether `permissions` grants `key` outright or through its containing grant. */
function listGrants(permissions: readonly string[], key: StaffPermissionKey): boolean {
  if (permissions.includes(key)) return true
  const parent = IMPLIED_BY[key]
  return parent !== undefined && permissions.includes(parent)
}

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
  return listGrants(user.permissions, key)
}

/** The keys `permissions` grants only by containment, for a picker to show as included. */
export function impliedPermissions(
  permissions: readonly string[] | null
): StaffPermissionKey[] {
  if (permissions === null) return []
  return (Object.keys(IMPLIED_BY) as StaffPermissionKey[]).filter(
    (key) => !permissions.includes(key) && permissions.includes(IMPLIED_BY[key] as string)
  )
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
  outlets: 'store_setup',
  'payment-methods': 'store_setup',
  branding: 'store_setup',
  'receipt-editor': 'store_setup',
  'hero-designer': 'store_setup',
  // Minting an MCP key grants full merchant authority — owner/store_setup only.
  mcp: 'store_setup',
  customers: 'customers',
  vouchers: 'vouchers',
  loyalty: 'loyalty_manage',
  // The roster plus who confirmed, cancelled and rang what: the owner's, or a
  // branch admin's for their own branch.
  staff: 'branch_staff',
}

/**
 * The permission gating a web admin pathname (with or without a tenant
 * prefix), or null when the route is open to all staff.
 */
export function permissionForAdminPath(pathname: string): StaffPermissionKey | null {
  const section = adminSectionForPath(pathname)
  if (section === null) return null
  return ADMIN_SECTION_PERMISSIONS[section] ?? null
}

/**
 * The admin section a pathname names (with or without a tenant prefix), or
 * null when the path is not an admin section — the dashboard itself included.
 *
 * Exported because more than permissions are decided per section: the branch
 * rules gate `outlets` the same way, and two copies of this parse could drift
 * into gating different paths.
 */
export function adminSectionForPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  const adminIndex = segments.indexOf('admin')
  if (adminIndex === -1) return null
  return segments[adminIndex + 1] ?? null
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
  // Renaming, hiding or rearranging a menu section rewrites the storefront's
  // navigation, so it rides the same grant the product list does.
  categories: 'menu',
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
