import { appRoute } from '@/lib/app-api/app-route'
import { handlePlaces } from '@/lib/app-api/delivery/places'

/**
 * GET /api/app/v1/places?q=&outletId= (Authorization: Bearer cs1.…)
 *   → {places: [{name, address, lat, lng}]} — delivery address type-ahead,
 *   biased to the branch's or the store's pin. Signed-in customers only:
 *   every call spends the shared Apple Maps quota.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = appRoute({ scope: 'places', rateLimit: { limit: 60, windowSec: 60 } }, handlePlaces)
