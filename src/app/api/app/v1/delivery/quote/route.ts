import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleDeliveryQuote } from '@/lib/app-api/delivery/quote-http'

/**
 * POST /api/app/v1/delivery/quote (Authorization: Bearer cs1.…)
 *   {outletId, address, lat, lng} → {fee, freeDeliveryMinimum, etaMinutes, quoteToken, expiresAt, distanceKm}
 * The checkout's own delivery pricing; Lalamove stores get a signed quotation
 * the order carries back as `delivery.quoteToken`.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:delivery-quote', per: 'ip', max: 30, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'delivery-quote' }, handleDeliveryQuote),
})
