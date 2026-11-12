import { appRoute } from '@/lib/app-api/app-route'
import { handleListOrders } from '@/lib/app-api/orders/orders-http'

/**
 * GET /api/app/v1/me/orders[?cursor=] (Authorization: Bearer cs1.…) → AppOrderPage
 * The signed-in customer's app orders, newest first, 20 a page.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = appRoute({ scope: 'my-orders', rateLimit: { limit: 120, windowSec: 60 } }, (context) => handleListOrders(context))
