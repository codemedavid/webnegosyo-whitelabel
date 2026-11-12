import { appRoute } from '@/lib/app-api/app-route'
import { handleMe } from '@/lib/customer-auth/sign-in-http'

/**
 * /api/app/v1/me (Authorization: Bearer cs1.…, bound to the build's store)
 *   GET    → profile {name, phoneE164}
 *   PATCH  {name} → profile
 *   DELETE → delete the app account (Apple 5.1.1(v)); the store keeps its orders and stamps
 */
const me = appRoute({ scope: 'me', rateLimit: { limit: 120, windowSec: 60 } }, handleMe)
export const GET = me
export const PATCH = me
export const DELETE = me
