import type { BundleWithSlots, Category, MenuItem, Outlet, OutletMenuOverride, Tenant } from '@/types/database'

type MenuContents = {
  categories: Category[]
  menuItems: MenuItem[]
  bundles: BundleWithSlots[]
  outlets: Outlet[]
  outletsFailed: boolean
  menuOverrides: OutletMenuOverride[]
  overridesFailed: boolean
  isBrandAdmin: boolean
}

/** A missing tenant and a failed read require different storefront states. */
export type MenuData = MenuContents & (
  | { status: 'ready'; tenant: Tenant; error: null }
  | { status: 'not-found'; tenant: null; error: string }
  | { status: 'error'; tenant: Tenant | null; error: string }
)
