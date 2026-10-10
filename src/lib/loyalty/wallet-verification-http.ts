// Public endpoints for the rewards page's "verify your number first" step.
// Only meaningful when the store turned the step on; the code itself rides the
// reward-code delivery path (gateway phone, else the store's Semaphore).
import 'server-only'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizePhoneE164 } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLoyaltySmsFallback } from '@/lib/tenant-secrets'
import { respond } from './merchant-http'
import { dispatchOtpViaSemaphore, loadOtpRouting, readLoyaltyStoreName } from './otp-delivery'
import { getLoyaltyTrustedIp } from './public-ingress'
import { jsonBody, paced } from './public-claims-http'
import { sendSemaphoreOtp } from './semaphore'
import { loadLoyaltyClaimCrypto } from './server-keys'
import { readWalletOtpRequired, type StoreSettingsClient } from './store-settings'
import { issueWalletChallenge, verifyWalletChallenge } from './wallet-verification'

const uuid = z.string().length(36).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform(value => value.toLowerCase())
const phone = z.string().min(1).max(64).regex(/^[+0-9 ()-]+$/)
  .transform(value => normalizePhoneE164(value))
  .pipe(z.string().regex(/^\+639[0-9]{9}$/))
const requestSchema = z.object({ tenantId: uuid, phone }).strict()
const verifySchema = z.object({ tenantId: uuid, challengeId: uuid, phone, code: z.string().regex(/^[0-9]{6}$/) }).strict()

export const WALLET_NO_SENDER = "This store can't text verification codes right now. Please ask the cashier for help."
const UNAVAILABLE = 'Verification is not available right now. Please try again later.'

function preparation(request: NextRequest) {
  if (process.env.LOYALTY_SMS_DELIVERY_ENABLED !== 'true') return null
  const trustedIp = getLoyaltyTrustedIp(request.headers)
  const crypto = loadLoyaltyClaimCrypto()
  return trustedIp && crypto ? { trustedIp, crypto } : null
}

function settingsClient(database: ReturnType<typeof createAdminClient>): StoreSettingsClient {
  return database as unknown as StoreSettingsClient
}

function waitPhrase(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 90) return `${minutes} minutes`
  return `${Math.ceil(minutes / 60)} hours`
}

async function rateLimited(start: number, retryAfterSeconds: number): Promise<NextResponse> {
  const response = await paced(start, {
    error: `Too many codes requested for this number. Please wait ${waitPhrase(retryAfterSeconds)} and try again.`,
    reason: 'rate_limited',
    retryAfterSeconds,
  }, 429)
  response.headers.set('Retry-After', String(retryAfterSeconds))
  return response
}

export async function handleWalletCodeRequest(request: NextRequest): Promise<NextResponse> {
  const prepared = preparation(request)
  if (!prepared) return respond({ error: WALLET_NO_SENDER, reason: 'no_sender' }, 503)
  const raw = await jsonBody(request)
  if (raw instanceof NextResponse) return raw
  const parsed = requestSchema.safeParse(raw)
  if (!parsed.success) return respond({ error: 'Enter a valid Philippine mobile number.' }, 400)
  const start = performance.now()
  const { tenantId } = parsed.data
  const database = createAdminClient()
  try {
    // A store that does not ask for codes never pays for one.
    if (!(await readWalletOtpRequired(settingsClient(database), tenantId))) {
      return paced(start, { error: 'This store does not need a code.', reason: 'not_required' }, 409)
    }
  } catch {
    return paced(start, { error: UNAVAILABLE }, 503)
  }
  const routing = await loadOtpRouting(tenantId, {
    database,
    readFallback: id => getLoyaltySmsFallback(database, id),
  })
  if (routing.sender === 'none') return paced(start, { error: WALLET_NO_SENDER, reason: 'no_sender' }, 503)
  // Members and strangers get the same answer: only members are ever texted.
  let challengeId: string = randomUUID()
  try {
    const result = await issueWalletChallenge({ ...parsed.data, trustedIp: prepared.trustedIp }, {
      crypto: prepared.crypto, database,
    })
    if (!result.ok && result.error === 'rate_limited') return rateLimited(start, result.retryAfterSeconds)
    if (result.ok) {
      challengeId = result.challengeId
      if (routing.sender === 'semaphore' && routing.semaphore) {
        await dispatchOtpViaSemaphore(
          { tenantId, challengeId, storeName: await readLoyaltyStoreName(database, tenantId) },
          { database, crypto: prepared.crypto, semaphore: routing.semaphore, send: sendSemaphoreOtp },
        )
      }
    }
  } catch {
    // Same answer for every outcome; never log phones or codes.
  }
  return paced(start, { accepted: true, challengeId, expiresInSeconds: 300 }, 202)
}

export async function handleWalletCodeVerify(request: NextRequest): Promise<NextResponse> {
  const prepared = preparation(request)
  if (!prepared) return respond({ error: UNAVAILABLE }, 503)
  const raw = await jsonBody(request)
  if (raw instanceof NextResponse) return raw
  const parsed = verifySchema.safeParse(raw)
  if (!parsed.success) return respond({ error: 'That code is not right. Check the SMS and try again.' }, 400)
  const start = performance.now()
  const result = await verifyWalletChallenge({ ...parsed.data, trustedIp: prepared.trustedIp }, {
    crypto: prepared.crypto, database: createAdminClient(),
  })
  if (result.ok) return paced(start, { sessionToken: result.token, expiresAt: result.expiresAt }, 200)
  if (result.error === 'invalid_code') {
    return paced(start, { error: 'That code is not right or has expired. Check the SMS or send a new code.' }, 400)
  }
  return paced(start, { error: 'Verification could not be confirmed. Please send a new code.' }, 503)
}
