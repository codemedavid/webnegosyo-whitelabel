import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleSignOut } from '@/lib/customer-auth/sign-in-http'

/** DELETE /api/app/v1/auth/session — sign this device out (Authorization: Bearer cs1.…). */
export const DELETE = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:session', per: 'ip', max: 30, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'session' }, handleSignOut),
})
