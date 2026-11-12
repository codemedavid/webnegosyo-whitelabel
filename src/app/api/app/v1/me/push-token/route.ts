import { appRoute } from '@/lib/app-api/app-route'
import { handlePushToken } from '@/lib/app-api/push/push-tokens'

/**
 * /api/app/v1/me/push-token (Authorization: Bearer cs1.…, bound to the build's store)
 *   POST   {token, platform, appVersion} → {registered: true}   this install gets order pushes
 *   DELETE → {registered: false}                                 notifications off on this install
 */
const pushToken = appRoute({ scope: 'push-token', rateLimit: { limit: 30, windowSec: 60 } }, handlePushToken)
export const POST = pushToken
export const DELETE = pushToken
