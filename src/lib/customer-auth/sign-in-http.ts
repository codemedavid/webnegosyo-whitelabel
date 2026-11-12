// HTTP handlers for the customer app's sign-in and account routes
// (/api/app/v1/auth/*, /api/app/v1/me). The store always comes from the
// build's X-App-Id (appRoute), never from the body; the code rides the
// loyalty OTP path (store phone, else the store's Semaphore, else nobody).
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { appOtpRequestSchema, appOtpVerifySchema, appProfilePatchSchema, type AppOtpVerifyResult } from '@/lib/app-contract'
import type { AppRouteContext } from '@/lib/app-api/app-route'
import { paceFrom, readAppJson } from '@/lib/app-api/request-body'
import { appFail, appOk } from '@/lib/app-api/respond'
import { dispatchOtpViaSemaphore, loadOtpRouting, readLoyaltyStoreName } from '@/lib/loyalty/otp-delivery'
import { getLoyaltyTrustedIp } from '@/lib/loyalty/public-ingress'
import { sendSemaphoreOtp } from '@/lib/loyalty/semaphore'
import { loadLoyaltyClaimCrypto } from '@/lib/loyalty/server-keys'
import { appDb } from '@/lib/app-api/service-db'
import { getLoyaltySmsFallback } from '@/lib/tenant-secrets'
import { deleteAccount, readProfile, readReviewPhone, resolveCustomerSession, revokeSession, updateProfileName } from './account'
import { canonicalLoginPhone, issueLoginChallenge, noteReviewRequest, openReviewSession, verifyLoginChallenge, type LoginVerifyResult } from './login-challenge'
import { readBearerSession } from './session-token'
import { removeSessionPushTokens } from '@/lib/app-api/push/push-tokens'

const CODE_LIFETIME_SECONDS = 300
const NO_STORE = { 'Cache-Control': 'no-store' }

export const SIGN_IN_OFF = 'Signing in isn’t available right now. You can still browse the menu.'
export const NO_SENDER = 'This store can’t text sign-in codes right now. You can still browse the menu.'
const BAD_PHONE = 'Enter a valid Philippine mobile number.'
const WRONG_CODE = 'That code isn’t right or has expired. Check the text or send a new code.'
const SIGNED_OUT = 'Please sign in again.'
const TRY_AGAIN = 'We couldn’t confirm that. Please send a new code.'

function waitPhrase(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes < 90 ? `${minutes} minutes` : `${Math.ceil(minutes / 60)} hours`
}

/** Sign-in needs the SMS release flag, the loyalty keys and a trusted client IP; otherwise it is off. */
function preparation(request: NextRequest) {
  if (process.env.LOYALTY_SMS_DELIVERY_ENABLED !== 'true') return null
  const trustedIp = getLoyaltyTrustedIp(request.headers)
  const crypto = loadLoyaltyClaimCrypto()
  return trustedIp && crypto ? { trustedIp, crypto } : null
}

/** The store's App Review number, only while its app is a draft; unreadable reads as "none". */
async function reviewPhoneFor(app: AppRouteContext['app']): Promise<string | null> {
  if (app.status !== 'draft') return null
  try {
    return await readReviewPhone(app.tenantId)
  } catch {
    return null
  }
}

const accepted = (challengeId: string) =>
  appOk({ challengeId, expiresInSeconds: CODE_LIFETIME_SECONDS }, { status: 202, headers: NO_STORE })

/** POST /auth/otp/request — the same 202 whether or not the number is known; only "this store can't text" is said plainly. */
export async function handleOtpRequest({ request, app }: AppRouteContext): Promise<NextResponse> {
  const prepared = preparation(request)
  if (!prepared) return appFail('unavailable', SIGN_IN_OFF)
  const parsed = appOtpRequestSchema.safeParse(await readAppJson(request))
  const phone = parsed.success ? canonicalLoginPhone(parsed.data.phone) : null
  if (!phone) return appFail('bad_request', BAD_PHONE)
  const start = performance.now()
  const decoy = randomUUID()

  const rateLimited = async (retryAfterSeconds: number) => {
    await paceFrom(start)
    return appFail('rate_limited', `Too many codes for this number. Please wait ${waitPhrase(retryAfterSeconds)} and try again.`, {
      retryAfterSec: retryAfterSeconds,
    })
  }

  // The review number gets the same limits and answer as any number, but no text.
  if ((await reviewPhoneFor(app)) === phone) {
    const noted = await noteReviewRequest({ tenantId: app.tenantId, phone, trustedIp: prepared.trustedIp }, { crypto: prepared.crypto, database: appDb({}) })
    if (!noted.ok && noted.error === 'rate_limited') return rateLimited(noted.retryAfterSeconds)
    await paceFrom(start)
    return accepted(decoy)
  }

  const database = appDb({})
  const routing = await loadOtpRouting(app.tenantId, { database, readFallback: (id) => getLoyaltySmsFallback(database, id) })
  if (routing.sender === 'none') {
    await paceFrom(start)
    return appFail('unavailable', NO_SENDER)
  }

  let challengeId: string = decoy
  try {
    const result = await issueLoginChallenge({ tenantId: app.tenantId, phone, trustedIp: prepared.trustedIp }, { crypto: prepared.crypto, database })
    if (!result.ok && result.error === 'rate_limited') return rateLimited(result.retryAfterSeconds)
    if (result.ok) {
      challengeId = result.challengeId
      if (routing.sender === 'semaphore' && routing.semaphore) {
        await dispatchOtpViaSemaphore(
          { tenantId: app.tenantId, challengeId, storeName: await readLoyaltyStoreName(database, app.tenantId), purpose: 'login' },
          { database, crypto: prepared.crypto, semaphore: routing.semaphore, send: sendSemaphoreOtp },
        )
      }
    }
  } catch {
    // Same answer for every outcome; never log phones or codes.
  }
  await paceFrom(start)
  return accepted(challengeId)
}

function signedIn(result: Extract<LoginVerifyResult, { ok: true }>): NextResponse {
  const body: AppOtpVerifyResult = {
    token: result.token,
    isNewCustomer: result.isNewCustomer,
    profile: { name: result.name && result.name.trim() ? result.name.trim().slice(0, 60) : null, phoneE164: result.phoneE164 },
  }
  return appOk(body, { headers: NO_STORE })
}

/** POST /auth/otp/verify — one answer for every wrong input. */
export async function handleOtpVerify({ request, app }: AppRouteContext): Promise<NextResponse> {
  const prepared = preparation(request)
  if (!prepared) return appFail('unavailable', SIGN_IN_OFF)
  const parsed = appOtpVerifySchema.safeParse(await readAppJson(request))
  if (!parsed.success) return appFail('unauthorized', WRONG_CODE)
  const start = performance.now()
  const phone = canonicalLoginPhone(parsed.data.phone)
  const deps = { crypto: prepared.crypto, database: appDb({}) }
  const isReview = phone !== null && (await reviewPhoneFor(app)) === phone
  const result = isReview
    ? await openReviewSession({ tenantId: app.tenantId, phone: parsed.data.phone, code: parsed.data.code, trustedIp: prepared.trustedIp }, deps)
    : await verifyLoginChallenge({ tenantId: app.tenantId, ...parsed.data, trustedIp: prepared.trustedIp }, deps)
  await paceFrom(start)
  if (result.ok) return signedIn(result)
  return result.error === 'invalid_code' ? appFail('unauthorized', WRONG_CODE) : appFail('unavailable', TRY_AGAIN)
}

/** DELETE /auth/session — sign out this device. Idempotent: no or unknown token is already signed out. */
export async function handleSignOut({ request, app }: AppRouteContext): Promise<NextResponse> {
  const tokenHash = readBearerSession(request.headers)
  if (tokenHash) {
    // This phone stops getting the account's order pushes. A failure here must not keep anyone signed in:
    // the sender only uses tokens of LIVE sessions, so a leftover row is never pushed to.
    await removeSessionPushTokens(app.tenantId, tokenHash).catch((error: unknown) =>
      console.error('[app-api:sign-out] push token removal failed', { message: error instanceof Error ? error.message : String(error) }),
    )
    await revokeSession(app.tenantId, tokenHash)
  }
  return appOk({ signedOut: true }, { headers: NO_STORE })
}

/** GET / PATCH / DELETE /me — the signed-in customer's app account at this store. */
export async function handleMe({ request, app }: AppRouteContext): Promise<NextResponse> {
  const session = await resolveCustomerSession(request.headers, app.tenantId)
  if (!session) return appFail('unauthorized', SIGNED_OUT)

  if (request.method === 'DELETE') {
    await deleteAccount(app.tenantId, session.customerId)
    return appOk({ deleted: true }, { headers: NO_STORE })
  }
  if (request.method === 'PATCH') {
    const parsed = appProfilePatchSchema.safeParse(await readAppJson(request))
    if (!parsed.success) return appFail('bad_request', 'Enter a name up to 60 characters.')
    if (!(await updateProfileName(app.tenantId, session.customerId, parsed.data.name))) return appFail('unauthorized', SIGNED_OUT)
  }
  const profile = await readProfile(app.tenantId, session.customerId)
  return profile ? appOk(profile, { headers: NO_STORE }) : appFail('unauthorized', SIGNED_OUT)
}
