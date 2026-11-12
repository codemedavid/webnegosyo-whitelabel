import { appRoute } from '@/lib/app-api/app-route'
import { handleOtpVerify } from '@/lib/customer-auth/sign-in-http'

/** POST /api/app/v1/auth/otp/verify  {challengeId, phone, code} → {token, isNewCustomer, profile} */
export const POST = appRoute({ scope: 'otp-verify', rateLimit: { limit: 20, windowSec: 60 } }, handleOtpVerify)
