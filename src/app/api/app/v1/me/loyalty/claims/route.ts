import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleClaimReward } from '@/lib/app-api/loyalty/loyalty-http'

/**
 * POST /api/app/v1/me/loyalty/claims {rewardId} (Authorization: Bearer cs1.…) → AppRewardClaim
 * A single-use reward QR (~2 minutes) the register scans, the same token the web rewards page shows.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:loyalty-claim', per: 'ip', max: 30, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'loyalty-claim' }, (context) => handleClaimReward(context)),
})
