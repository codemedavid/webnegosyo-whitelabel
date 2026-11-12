import { appRoute } from '@/lib/app-api/app-route'
import { handlePlaceOrder } from '@/lib/app-api/orders/orders-http'

/**
 * POST /api/app/v1/orders (Authorization: Bearer cs1.…, Idempotency-Key: <one per checkout attempt>)
 *   AppOrderDraft → 201 AppOrderDetail (200 when the key already placed this order)
 * Goes through the web checkout's own order engine (`placeOrder`, channel 'app').
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = appRoute({ scope: 'orders', rateLimit: { limit: 20, windowSec: 60 } }, (context) => handlePlaceOrder(context))
