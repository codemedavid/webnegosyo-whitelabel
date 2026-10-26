import { z } from 'zod'
import { appFail } from '@/lib/app-api/respond'
import { appCachedOk, appRoute } from '@/lib/app-api/app-route'
import { projectAppCatalog } from '@/lib/app-api/project-catalog'
import { AppReadError, readAppOrderTypes, readAppPaymentMethods, readComplementaryPairs } from '@/lib/app-api/store-reads'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'

/**
 * GET /api/app/v1/catalog[?outletId=<branch>] — the menu, order types,
 * branches, pairings and payment methods, from the same reads as the web
 * storefront and checkout. With `outletId` the menu is that branch's (its
 * prices, without the dishes it does not carry).
 *
 * A failed branch read is "unavailable", never a silent store-wide menu: on a
 * multi-branch store that would quote the wrong prices for the wrong kitchen.
 */

const outletIdSchema = z.string().uuid().nullable()

export const GET = appRoute({ scope: 'catalog', rateLimit: { limit: 120, windowSec: 60 } }, async ({ request, app }) => {
  const outletParam = outletIdSchema.safeParse(request.nextUrl.searchParams.get('outletId'))
  if (!outletParam.success) return appFail('bad_request', 'That branch was not found.')

  const menu = await getStorefrontMenu(app.slug)
  if (menu.status === 'not-found' || !menu.tenant) return appFail('not_found', 'This store is not available.')
  if (menu.status === 'error') throw new AppReadError('the menu', menu.error ?? 'unknown')
  if (menu.outletsFailed || menu.overridesFailed) throw new AppReadError('branches', 'branch menu read failed')

  const outletId = outletParam.data
  if (outletId && !menu.outlets.some((outlet) => outlet.id === outletId)) return appFail('bad_request', 'That branch was not found.')

  const [orderTypes, paymentMethods, pairs] = await Promise.all([
    readAppOrderTypes(menu.tenant.id),
    readAppPaymentMethods(menu.tenant.id),
    readComplementaryPairs(menu.tenant.id),
  ])

  const catalog = projectAppCatalog({
    tenant: menu.tenant as unknown as Record<string, unknown>,
    categories: menu.categories,
    menuItems: menu.menuItems,
    orderTypes,
    outlets: menu.outlets,
    outletOverrides: menu.menuOverrides,
    outletId,
    paymentMethods,
    pairs,
  })
  return appCachedOk(request, catalog, 120)
})
