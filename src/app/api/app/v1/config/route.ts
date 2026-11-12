import type { Outlet } from '@/lib/app-api/store-types'
import { appFail } from '@/lib/app-api/respond'
import { appCachedOk, appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { projectAppConfig } from '@/lib/app-api/project-config'
import { AppReadError, readActiveOutlets, readAppOrderTypes, readLoyaltyFlags, readPublishedAppConfig } from '@/lib/app-api/store-reads'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'

/**
 * GET /api/app/v1/config — the store, its theme, switches, copy and home.
 *
 * `features.ordering` depends on the clock (operating hours), so the answer is
 * cached by the phone for one minute only; the tenant row underneath is the
 * storefront's own 5-minute cached read.
 */

export const GET = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:config', per: 'ip', max: 120, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'config' }, async ({ request, app }) => {
  const { tenant, error } = await getStorefrontTenant(app.slug)
  if (error) throw new AppReadError('the store', error)
  if (!tenant) return appFail('not_found', 'This store is not available.')

  const [published, loyalty, orderTypes, outlets] = await Promise.all([
    readPublishedAppConfig(tenant.id),
    readLoyaltyFlags(tenant.id),
    readAppOrderTypes(tenant.id),
    isMultiBranchEnabled(tenant) ? readActiveOutlets(tenant.id) : Promise.resolve([] as Outlet[]),
  ])

  const config = projectAppConfig({
    tenant: { ...(tenant as unknown as Record<string, unknown>), id: tenant.id, slug: tenant.slug, name: tenant.name, ...loyalty },
    published: published.published,
    orderTypes,
    outlets: outlets.map((outlet) => ({ ...outlet, is_active: true })),
    now: new Date(),
  })
  return appCachedOk(request, config, 60)
}),
})
