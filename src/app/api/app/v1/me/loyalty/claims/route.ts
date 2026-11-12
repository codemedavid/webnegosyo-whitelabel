import { appRoute } from '@/lib/app-api/app-route'
import { handleClaimReward } from '@/lib/app-api/loyalty/loyalty-http'

/**
 * POST /api/app/v1/me/loyalty/claims {rewardId} (Authorization: Bearer cs1.…) → AppRewardClaim
 * A single-use reward QR (~2 minutes) the register scans, the same token the web rewards page shows.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = appRoute({ scope: 'loyalty-claim', rateLimit: { limit: 30, windowSec: 60 } }, (context) => handleClaimReward(context))
