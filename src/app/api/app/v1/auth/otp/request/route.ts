import { appRoute } from '@/lib/app-api/app-route'
import { handleOtpRequest } from '@/lib/customer-auth/sign-in-http'

/**
 * POST /api/app/v1/auth/otp/request  {phone}
 *
 * Texts a 6-digit sign-in code through the store's own phone (or its
 * Semaphore account). Always 202 with a challenge id, known number or not;
 * per number / IP / store limits live in issue_customer_login_challenge.
 */
export const POST = appRoute({ scope: 'otp-request', rateLimit: { limit: 10, windowSec: 60 } }, handleOtpRequest)
