import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handlePushToken } from '@/lib/app-api/push/push-tokens'

/**
 * /api/app/v1/me/push-token (Authorization: Bearer cs1.…, bound to the build's store)
 *   POST   {token, platform, appVersion} → {registered: true}   this install gets order pushes
 *   DELETE → {registered: false}                                 notifications off on this install
 */
const pushTokenHandler = appRoute({ scope: 'push-token' }, handlePushToken)
export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:push-token', per: 'ip', max: 30, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: pushTokenHandler,
})
export const DELETE = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:push-token', per: 'ip', max: 30, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: pushTokenHandler,
})
