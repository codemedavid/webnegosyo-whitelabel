import { appRoute } from '@/lib/app-api/app-route'
import { handleGetLoyalty } from '@/lib/app-api/loyalty/loyalty-http'

/**
 * GET /api/app/v1/me/loyalty (Authorization: Bearer cs1.…) → AppLoyalty
 * The signed-in customer's stamps/points, unlocked rewards, member QR and history.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = appRoute({ scope: 'my-loyalty', rateLimit: { limit: 120, windowSec: 60 } }, (context) => handleGetLoyalty(context))
