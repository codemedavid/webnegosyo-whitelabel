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
  // Approving Senior/PWD discounts with a PIN and reviewing every grant in the
  // sales book. Giving the discount needs no grant (refusing one is a crime);
  // vouching for a large one and auditing the ledger is a manager's job.
  'discount_review',
  // Store activity & approvals. Both are OPT-IN (see OPT_IN_PERMISSION_KEYS):
  // reading what every colleague did, and approving another person's refund
  // or cancellation, are trust an owner hands out by name — never something a
  // legacy full-access account (`permissions: null`) inherits silently.
  'activity_view',
  'approve_requests',
  // Sales reports: the sales summary and breakdowns, transaction history,
  // payments, end-of-day, and their exports. Implied by 'analytics' (see
  // IMPLIED_BY), which already showed every sales figure. 'orders' does NOT
  // grant it: running the live queue is not reading the books.
  'reports',
  // Stock: deliveries, waste, counts, transfers, reorder levels and the
  // low-stock bell. Carved out of 'menu', which keeps recipes and the
  // ingredient master, so a kitchen hand can count the shelf without editing
  // the menu. Every account holding 'menu' was given it once (migration
  // 20261013120100), so nobody lost the stock screens.
  'inventory',
  // What things cost: ingredient prices, dish cost, COGS, gross profit and
  // food cost %. The database enforces every cost CHANGE (a price edit or a
  // priced delivery) and the frozen sale costs; ingredient prices are still
  // readable through the API until cost moves to its own table (plan §8.8,
  // Phase 3/5), so screens hide them. Given once to every 'menu' holder
  // alongside 'inventory'.
  'costs',
  // The expense book: recording, fixing and voiding expenses, the categories
  // and suppliers they file under. Its own key, implied by nothing: spending
  // the store's money is not reading its sales ('reports') or pricing its
  // ingredients ('costs'). The profit page needs this AND 'costs'.
  'expenses',
  // Cash & day close: setting up drawers, picking up cash from someone else's
  // drawer, closing another person's shift, receiving remittances and closing
  // the business day. Used to ride 'store_setup' (app_user_manages_cash); it
  // is its own grant so a supervisor can hold the cash without the
  // storefront. NOT opt-in (legacy full access held cash management before,
  // and keeps it) and NOT in IMPLIED_BY: every 'store_setup' holder was given
  // it once by migration 20261027120100, so nobody lost the drawer screens,
  // and the owner can separate the two afterwards. A cashier's OWN shift
  // (clock in, count, remit) needs only 'pos'.
  'cash_manage',
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
  discount_review: {
    label: 'Approve & Review Discounts',
    description: 'Approve Senior/PWD discounts with a PIN and review the sales book — for managers',
  },
  activity_view: {
    label: 'See store activity',
    description: "See refunds, cancellations, stock changes and drawer moves by everyone — not just their own",
  },
  approve_requests: {
    label: 'Approve requests',
    description: "Approve or decline a colleague's refund, cancellation, discount or write-off — grant sparingly",
  },
  reports: {
    label: 'Sales Reports',
    description: 'Sales summary, transactions, payments and end-of-day, and their exports',
  },
  inventory: {
    label: 'Inventory',
    description: 'Record deliveries, waste and counts, move stock between branches, see low-stock alerts',
  },
  costs: {
    label: 'Costs & Profit',
    description: 'See and change what ingredients cost, dish costs, gross profit and food cost %',
  },
  expenses: {
    label: 'Expenses',
    description: 'Record, fix and void expenses, manage categories and suppliers, see the expense book.',
  },
  cash_manage: {
    label: 'Cash & day close',
    description:
      "Set up cash drawers, pick up cash, close others' shifts, receive remittances, close the business day and see that day's sales. Give it to supervisors you trust with cash.",
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
  // Every sales figure a report shows was already on Growth & Analytics.
  reports: 'analytics',
}

/**
 * Keys that full access (`permissions: null`) does NOT grant. Owners and
 * superadmins still hold them; everyone else needs them ticked by name.
 *
 * `null` predates staff management and means "everything that existed then".
 * Watching every colleague's refunds and approving another person's money
 * moves are new kinds of trust, so a legacy account must not wake up holding
 * them. The expense book (salaries, rent, owner draws) and the Profit it
 * feeds are the same kind of trust (owner's call, 2026-10-22): a person is
 * given Expenses by name. Mirrored in SQL by `public.app_user_has_permission` and in the three
 * other registry copies (staff-permissions-parity.test.ts pins all of them).
 */
export const OPT_IN_PERMISSION_KEYS = ['activity_view', 'approve_requests', 'expenses'] as const satisfies readonly StaffPermissionKey[]

/** Whether full access (`permissions: null`) grants `key`. */
export function isGrantedByFullAccess(key: string): boolean {
  return !(OPT_IN_PERMISSION_KEYS as readonly string[]).includes(key)
}

/**
 * Who may read a store's orders and order lines at all (and so its customer
 * names, phones and addresses). Mirrored in SQL by the orders SELECT policy
 * (migration 20261013120200) and in the app's copy; staff-permissions tests
 * pin all three. `kitchen` and `tables` are listed although `orders` implies
 * them: a cook's or host's tablet holds them without `orders`.
 */
export const ORDER_READ_KEYS = ['orders', 'pos', 'kitchen', 'tables', 'analytics', 'reports'] as const satisfies readonly StaffPermissionKey[]

/**
 * Who may read the money taken on an order (order_payments, order_revisions).
 * The kitchen display reads tickets, never the till.
 */
export const PAYMENT_READ_KEYS = ['orders', 'pos', 'tables', 'analytics', 'reports'] as const satisfies readonly StaffPermissionKey[]

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
 * admins created before staff management existed) — except for the opt-in
 * keys, which must be granted by name.
 */
export function hasPermission(user: PermissionHolder, key: StaffPermissionKey): boolean {
  if (user.role === 'superadmin' || user.is_owner) return true
  if (user.permissions == null) return isGrantedByFullAccess(key)
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

/**
 * The list a permission editor starts from. A legacy full-access account
 * (`null`) opens with everything it can do ticked: opening it with nothing
 * ticked made the first Save strip every grant at once. A stored list is
 * copied as-is, including keys this build does not know, so an editor never
 * drops what it cannot see.
 */
export function editablePermissions(permissions: readonly string[] | null): string[] {
  return permissions === null ? [...STAFF_PERMISSION_KEYS] : [...permissions]
}

/** Whether `user` holds at least one of `keys` (owners and full access hold all). */
export function hasAnyPermission(user: PermissionHolder, keys: readonly StaffPermissionKey[]): boolean {
  return keys.some((key) => hasPermission(user, key))
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
  // Stock, deliveries, waste, counts, transfers. Revenue and cost figures on
  // these pages are gated again inside the page (`reports`, `costs`).
  inventory: 'inventory',
  // The add-on library rewrites what every dish offers, like the menu itself.
  addons: 'menu',
  // Sales reports (Phase 1 routes register here before they exist, so the
  // first page under /admin/reports can never ship open to every account).
  reports: 'reports',
  // The expense book. The profit page lives under reports and re-checks
  // 'expenses' + 'costs' inside the page.
  expenses: 'expenses',
  // Cash & remits: shifts by business day, drawers, remittances, day close and
  // the cash rules. A cashier's own shift lives in the app and needs only 'pos'.
  cash: 'cash_manage',
  'boost-sales': 'analytics',
  'product-analytics': 'analytics',
  'menu-engineering': 'analytics',
  'order-types': 'store_setup',
  outlets: 'store_setup',
  'payment-methods': 'store_setup',
  // Launch checklist: what a pre-launch store still needs.
  launch: 'store_setup',
  branding: 'store_setup',
  'receipt-editor': 'store_setup',
  // Printed store, branch and table codes.
  'qr-codes': 'store_setup',
  'hero-designer': 'store_setup',
  'welcome-designer': 'store_setup',
  // Minting an MCP key grants full merchant authority — owner/store_setup only.
  mcp: 'store_setup',
  customers: 'customers',
  // Campaigns, automatic texts and sending phones reach the same guest list.
  texts: 'customers',
  vouchers: 'vouchers',
  loyalty: 'loyalty_manage',
  // The Senior/PWD sales book, its flags and the BIR exports.
  'gov-discounts': 'discount_review',
  // The roster plus who confirmed, cancelled and rang what: the owner's, or a
  // branch admin's for their own branch.
  staff: 'branch_staff',
}

/**
 * Admin sections open to every staff account ON PURPOSE. A section that is
 * neither here nor in ADMIN_SECTION_PERMISSIONS is open BY ACCIDENT, and
 * tests/unit/staff-permissions-reports-inventory.test.ts fails on it.
 */
export const OPEN_ADMIN_SECTIONS = [
  // Their own password and the sections the page gates one by one.
  'settings',
  // Video lessons on using the product.
  'learn',
  // The onboarding path; its steps link into gated pages, which gate themselves.
  'start',
] as const

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
  // Stock and its priced daily report were carved out of 'menu'. Mirrors the
  // app's TAB_PERMISSIONS (webnegosyo-app/lib/staff-permissions.ts).
  inventory: 'inventory',
  'daily-report': 'costs',
  // The expense book; the profit screen rides 'reports' and re-checks
  // 'expenses' + 'costs' itself. Mirrors the app's TAB_PERMISSIONS.
  expenses: 'expenses',
  'expense-bills': 'expenses',
  profit: 'reports',
  // Cash-manager screens. Mirrors the app's TAB_PERMISSIONS; "cash-rules" is
  // any-of there (cash_manage or settings, it holds the business-day cutoff),
  // so it is not named in this single-key map.
  'cash-drawers': 'cash_manage',
  remittances: 'cash_manage',
  'day-close': 'cash_manage',
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
