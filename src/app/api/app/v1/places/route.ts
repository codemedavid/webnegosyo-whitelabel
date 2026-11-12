import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handlePlaces } from '@/lib/app-api/delivery/places'

/**
 * GET /api/app/v1/places?q=&outletId= (Authorization: Bearer cs1.…)
 *   → {places: [{name, address, lat, lng}]} — delivery address type-ahead,
 *   biased to the branch's or the store's pin. Signed-in customers only:
 *   every call spends the shared Apple Maps quota.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:places', per: 'ip', max: 60, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'places' }, handlePlaces),
})
