import type { BundleWithSlots, Category, MenuItem, Outlet, OutletMenuOverride, Tenant } from '@/types/database'

export interface MenuContents {
  categories: Category[]
  menuItems: MenuItem[]
  bundles: BundleWithSlots[]
  outlets: Outlet[]
  outletsFailed: boolean
  menuOverrides: OutletMenuOverride[]
  overridesFailed: boolean
}

/**
 * The public, visitor-independent menu — what the storefront cache stores.
 * A missing tenant and a failed read require different storefront states.
 */
export type MenuSnapshot = MenuContents & (
  | { status: 'ready'; tenant: Tenant; error: null }
  | { status: 'not-found'; tenant: null; error: string }
  | { status: 'error'; tenant: Tenant | null; error: string }
)

/** The snapshot plus the one per-visitor fact the page renders. */
export type MenuData = MenuSnapshot & { isBrandAdmin: boolean }
