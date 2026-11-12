import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleGetLoyalty } from '@/lib/app-api/loyalty/loyalty-http'

/**
 * GET /api/app/v1/me/loyalty (Authorization: Bearer cs1.…) → AppLoyalty
 * The signed-in customer's stamps/points, unlocked rewards, member QR and history.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:my-loyalty', per: 'ip', max: 120, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'my-loyalty' }, (context) => handleGetLoyalty(context)),
})
