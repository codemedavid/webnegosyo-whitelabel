import type { MenuData } from '@/storefront/data/menu-data'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { resolveIsBrandAdmin } from '@/lib/storefront/brand-admin'

/**
 * Everything the menu page renders.
 *
 * The public menu comes from the storefront cache (one query plan per tenant
 * per revalidation window). The admin check is the only per-request read, and
 * it runs alongside rather than after the menu: the tenant read it needs is
 * the same cached entry the menu was built from.
 */
export async function getMenuData(tenantSlug: string): Promise<MenuData> {
  const [snapshot, isBrandAdmin] = await Promise.all([
    getStorefrontMenu(tenantSlug),
    getStorefrontTenant(tenantSlug).then(({ tenant }) => (tenant ? resolveIsBrandAdmin(tenant.id) : false)),
  ])

  return { ...snapshot, isBrandAdmin }
}
