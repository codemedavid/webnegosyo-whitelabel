/**
 * Which admin sidebar sections a tenant's feature flags hide.
 *
 * Extracted verbatim from the filtering the sidebar did inline, so it can be
 * tested directly instead of only through a rendered component. The behaviour
 * is unchanged — the regression block in the test file pins the exact hidden
 * set each existing flag combination produces.
 */

export interface AdminSidebarFlags {
  enableOrderManagement?: boolean | null
  menuEngineeringEnabled?: boolean | null
  bundlesEnabled?: boolean | null
  convexConfigured?: boolean | null
  inventoryEnabled?: boolean | null
  multiBranchEnabled?: boolean | null
}

export function hiddenAdminSidebarPaths(flags: AdminSidebarFlags): Set<string> {
  const paths = new Set<string>()

  // Strictly `false`: an unset flag has always meant "show orders", and tenant
  // rows created before the column exists read as undefined.
  if (flags.enableOrderManagement === false) paths.add('/orders')

  if (!flags.menuEngineeringEnabled) {
    paths.add('/boost-sales')
    // Product Analytics shows basic per-product sales whenever Convex is
    // configured (advanced BCG/cost features are gated inside the page), so
    // only hide it when there is no Convex backend at all.
    if (!flags.convexConfigured) paths.add('/product-analytics')
  }

  if (!flags.bundlesEnabled) paths.add('/bundles')
  if (!flags.inventoryEnabled) paths.add('/inventory')
  if (!flags.multiBranchEnabled) paths.add('/outlets')

  return paths
}

/** Whether a (tenant-prefixed) admin href belongs to a hidden section. */
export function isHiddenAdminHref(href: string, hiddenPaths: ReadonlySet<string>): boolean {
  for (const path of hiddenPaths) {
    if (href.includes(path)) return true
  }
  return false
}
