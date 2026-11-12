import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleMe } from '@/lib/customer-auth/sign-in-http'

/**
 * /api/app/v1/me (Authorization: Bearer cs1.…, bound to the build's store)
 *   GET    → profile {name, phoneE164}
 *   PATCH  {name} → profile
 *   DELETE → delete the app account (Apple 5.1.1(v)); the store keeps its orders and stamps
 */
const meHandler = appRoute({ scope: 'me' }, handleMe)
export const GET = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:me', per: 'ip', max: 120, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: meHandler,
})
export const PATCH = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:me', per: 'ip', max: 120, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: meHandler,
})
export const DELETE = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:me', per: 'ip', max: 120, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: meHandler,
})
