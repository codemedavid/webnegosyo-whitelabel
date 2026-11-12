import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handlePlaceOrder } from '@/lib/app-api/orders/orders-http'

/**
 * POST /api/app/v1/orders (Authorization: Bearer cs1.…, Idempotency-Key: <one per checkout attempt>)
 *   AppOrderDraft → 201 AppOrderDetail (200 when the key already placed this order)
 * Goes through the web checkout's own order engine (`placeOrder`, channel 'app').
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:orders', per: 'ip', max: 20, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'orders' }, (context) => handlePlaceOrder(context)),
})
