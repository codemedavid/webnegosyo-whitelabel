import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleOtpVerify } from '@/lib/customer-auth/sign-in-http'

/** POST /api/app/v1/auth/otp/verify  {challengeId, phone, code} → {token, isNewCustomer, profile} */
export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:otp-verify', per: 'ip', max: 20, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'otp-verify' }, handleOtpVerify),
})
