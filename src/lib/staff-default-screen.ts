// The screens an owner may pin a staff account to, so the merchant app opens
// on the one that account actually works in — the register for a cashier, the
// kitchen board for a cook.
//
// This is the web half of a registry the merchant app holds the other copy of
// (webnegosyo-app/lib/workspaces.ts plus its permission map). The two builds
// share no package, so the lists are duplicated and
// tests/unit/staff-default-screen-parity.test.ts is what keeps them honest:
// it compares this file against the app's own tab registry and permission
// gate, so adding a tab there is what makes this file fail.
//
// Pure data + lookups; no I/O.

import { hasPermission, type StaffPermissionKey } from '@/lib/staff-permissions'

export interface DefaultScreenOption {
  /** Route name under the app's app/(main)/ directory. */
  tab: string
  /** How the screen is named to the owner choosing it. */
  label: string
  /** What the staff member would use it for. */
  description: string
  /** The view the app files this screen under. */
  workspace: 'operations' | 'register' | 'insights' | 'products' | 'business'
  /** Grant needed to open it; null when the screen is open to every account. */
  permission: StaffPermissionKey | null
}

/**
 * Branches a store needs before the branch-comparison screens are worth
 * pinning anyone to. Mirrors MIN_BRANCHES_FOR_PORTFOLIO in the app: a
 * portfolio of one row is the dashboard with fewer numbers.
 */
export const MIN_BRANCHES_FOR_BRANCH_SCREENS = 2

/**
 * Order matches the app's tab registry, view by view, so the picker reads in
 * the same order as the tab bar the staff member will see.
 */
export const DEFAULT_SCREEN_OPTIONS: readonly DefaultScreenOption[] = [
  {
    tab: 'dashboard',
    label: 'Home',
    description: "Today's takings and the live order queue",
    workspace: 'operations',
    permission: null,
  },
  {
    tab: 'orders',
    label: 'Orders',
    description: 'The full order list, with status and payment',
    workspace: 'operations',
    permission: 'orders',
  },
  {
    tab: 'kitchen',
    label: 'Kitchen Display',
    description: 'Active tickets on the pass — best for a cook',
    workspace: 'operations',
    permission: 'kitchen',
  },
  {
    tab: 'tables',
    label: 'Tables',
    description: 'The floor plan — who is seated where, and what they ordered',
    workspace: 'operations',
    permission: 'tables',
  },
  {
    tab: 'scheduled',
    label: 'Scheduled Orders',
    description: 'Pre-orders sorted by the time they were asked for',
    workspace: 'operations',
    permission: 'orders',
  },
  {
    tab: 'pos',
    label: 'Register',
    description: 'Ring up counter sales — best for a cashier',
    workspace: 'register',
    permission: 'pos',
  },
  {
    tab: 'pos-sales',
    label: 'Drawer',
    description: 'Counter sales taken and the drawer reconciliation',
    workspace: 'register',
    permission: 'pos',
  },
  {
    tab: 'analytics',
    label: 'Analytics',
    description: 'Sales figures and upsell performance',
    workspace: 'insights',
    permission: 'analytics',
  },
  {
    tab: 'trends',
    label: 'Trends',
    description: 'Revenue over time',
    workspace: 'insights',
    permission: 'analytics',
  },
  {
    tab: 'growth',
    label: 'Growth',
    description: 'The growth coach and its suggested actions',
    workspace: 'insights',
    permission: 'analytics',
  },
  {
    tab: 'customer-hub',
    label: 'Regulars',
    description: 'Who comes back, and what they keep ordering',
    workspace: 'insights',
    // The same records the guest list protects, aggregated. Summarising PII
    // does not declassify it, so it rides the same key.
    permission: 'customers',
  },
  {
    tab: 'customers',
    label: 'Guest list',
    description: 'The guest list and follow-up campaigns',
    workspace: 'insights',
    permission: 'customers',
  },
  {
    tab: 'loyalty',
    label: 'Rewards',
    description: 'Loyalty programs: stamps, points and rewards',
    workspace: 'insights',
    permission: 'loyalty_manage',
  },
  {
    tab: 'product-analytics',
    label: 'Product Performance',
    description: 'What sells, day by day',
    workspace: 'products',
    permission: 'analytics',
  },
  {
    tab: 'product-management',
    label: 'Manage Products',
    description: 'Edit the menu, prices, and availability',
    workspace: 'products',
    permission: 'menu',
  },
  {
    tab: 'categories',
    label: 'Categories',
    description: 'Menu sections, their order and icons',
    workspace: 'products',
    permission: 'menu',
  },
  {
    tab: 'inventory',
    label: 'Stock',
    description: 'Ingredient levels, counts, and transfers',
    workspace: 'products',
    permission: 'menu',
  },
  {
    tab: 'daily-report',
    label: 'Daily Report',
    description: 'Yesterday reconciled — usage, variance, and cost',
    workspace: 'products',
    permission: 'menu',
  },
  {
    tab: 'payments',
    label: 'Payment Methods',
    description: 'Where the store gets paid',
    workspace: 'products',
    permission: 'store_setup',
  },
  {
    tab: 'portfolio',
    label: 'Branches',
    description: 'Every branch at a glance',
    workspace: 'business',
    permission: 'analytics',
  },
  {
    tab: 'branches',
    label: 'Compare Branches',
    description: 'Branch against branch on the same figures',
    workspace: 'business',
    permission: 'analytics',
  },
  {
    tab: 'branch-menu',
    label: 'Branch Menu',
    description: 'Which branch carries which product',
    workspace: 'business',
    permission: 'menu',
  },
]

export interface DefaultScreenAudience {
  /** Grants held; null means full access (owners and legacy admins). */
  permissions: readonly string[] | null
  /** True when the account is confined to a single branch. */
  isBranchScoped?: boolean
  /** Branches the store runs. Unknown means "do not narrow on this". */
  branchCount?: number
}

function holdsPermission(
  permissions: readonly string[] | null,
  required: StaffPermissionKey | null
): boolean {
  if (required === null) return true
  // Routed through the shared gate so a screen included in a broader grant
  // (IMPLIED_BY) can be pinned, not just one ticked by name.
  return hasPermission({ role: 'admin', permissions: permissions ? [...permissions] : null }, required)
}

function coversBranchScreens(audience: DefaultScreenAudience): boolean {
  if (audience.isBranchScoped) return false
  if (audience.branchCount === undefined) return true
  return audience.branchCount >= MIN_BRANCHES_FOR_BRANCH_SCREENS
}

/**
 * The screens worth offering for this account.
 *
 * Two filters, and both matter for the same reason: the app re-checks each one
 * at launch and silently ignores a choice that fails it. Offering a screen the
 * app will refuse means the owner sets it, sees it saved, and nothing happens
 * — which reads as a broken setting rather than as a restriction.
 */
export function selectableDefaultScreens(
  audience: DefaultScreenAudience
): DefaultScreenOption[] {
  const branchScreensAllowed = coversBranchScreens(audience)

  return DEFAULT_SCREEN_OPTIONS.filter((option) => {
    if (!holdsPermission(audience.permissions, option.permission)) return false
    if (option.workspace === 'business' && !branchScreensAllowed) return false
    return true
  })
}

/**
 * The stored value for a submitted choice, or null for "no preference".
 *
 * Deliberately total: the value crosses a server-action boundary, so it is
 * untyped in practice, and a bad one must become "no choice" rather than an
 * error the owner has to decode. Branch availability is not checked here —
 * that changes on its own, and a choice made while a store had branches should
 * survive in the column and start working again if it gets them back.
 */
export function validateDefaultTab(
  input: unknown,
  permissions: readonly string[] | null
): string | null {
  if (typeof input !== 'string') return null

  const tab = input.trim()
  if (tab === '') return null

  const option = DEFAULT_SCREEN_OPTIONS.find((candidate) => candidate.tab === tab)
  if (!option) return null

  return holdsPermission(permissions, option.permission) ? tab : null
}
