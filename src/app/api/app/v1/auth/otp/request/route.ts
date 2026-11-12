import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleOtpRequest } from '@/lib/customer-auth/sign-in-http'

/**
 * POST /api/app/v1/auth/otp/request  {phone}
 *
 * Texts a 6-digit sign-in code through the store's own phone (or its
 * Semaphore account). Always 202 with a challenge id, known number or not;
 * per number / IP / store limits live in issue_customer_login_challenge.
 */
export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:otp-request', per: 'ip', max: 10, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'otp-request' }, handleOtpRequest),
})
