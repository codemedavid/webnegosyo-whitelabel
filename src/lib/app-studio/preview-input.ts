import 'server-only'
import type { Outlet } from '@/types/database'
import type { AppConfigInput } from '@/lib/app-api/project-config'
import { projectAppCatalog } from '@/lib/app-api/project-catalog'
import { readActiveOutlets, readAppOrderTypes, readAppPaymentMethods, readLoyaltyFlags } from '@/lib/app-api/store-reads'
import type { AppCatalog } from '@/lib/app-contract'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'

/**
 * What App Studio needs to show a store's Home as the app would: the SAME
 * reads `/api/app/v1/config` and `/catalog` make (cached storefront reads), so
 * the preview and the publish check judge the draft against the live store.
 */
export interface AppStudioStore {
  configInput: Omit<AppConfigInput, 'published'>
  catalog: Pick<AppCatalog, 'categories' | 'items'>
  logoUrl: string | null
}

export async function loadAppStudioStore(slug: string): Promise<AppStudioStore | null> {
  const menu = await getStorefrontMenu(slug)
  if (!menu.tenant) return null
  const tenant = menu.tenant
  const [loyalty, orderTypes, paymentMethods, outlets] = await Promise.all([
    readLoyaltyFlags(tenant.id),
    readAppOrderTypes(tenant.id),
    readAppPaymentMethods(tenant.id),
    isMultiBranchEnabled(tenant) ? readActiveOutlets(tenant.id) : Promise.resolve([] as Outlet[]),
  ])
  const catalog = projectAppCatalog({
    tenant: tenant as unknown as Record<string, unknown>,
    categories: menu.categories,
    menuItems: menu.menuItems,
    orderTypes,
    outlets: menu.outlets,
    outletOverrides: menu.menuOverrides,
    outletId: null,
    paymentMethods,
    pairs: [],
  })
  const logo = (tenant as unknown as { logo_url?: string | null }).logo_url
  return {
    configInput: {
      tenant: { ...(tenant as unknown as Record<string, unknown>), id: tenant.id, slug: tenant.slug, name: tenant.name, ...loyalty },
      orderTypes,
      outlets: outlets.map((outlet) => ({ ...outlet, is_active: true })),
      now: new Date(),
    },
    catalog: { categories: catalog.categories, items: catalog.items },
    logoUrl: typeof logo === 'string' && logo.startsWith('https://') ? logo : null,
  }
}
