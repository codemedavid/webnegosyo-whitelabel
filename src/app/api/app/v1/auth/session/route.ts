import { appRoute } from '@/lib/app-api/app-route'
import { handleSignOut } from '@/lib/customer-auth/sign-in-http'

/** DELETE /api/app/v1/auth/session — sign this device out (Authorization: Bearer cs1.…). */
export const DELETE = appRoute({ scope: 'session', rateLimit: { limit: 30, windowSec: 60 } }, handleSignOut)
