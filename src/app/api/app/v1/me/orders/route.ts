import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleListOrders } from '@/lib/app-api/orders/orders-http'

/**
 * GET /api/app/v1/me/orders[?cursor=] (Authorization: Bearer cs1.…) → AppOrderPage
 * The signed-in customer's app orders, newest first, 20 a page.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:my-orders', per: 'ip', max: 120, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'my-orders' }, (context) => handleListOrders(context)),
})
