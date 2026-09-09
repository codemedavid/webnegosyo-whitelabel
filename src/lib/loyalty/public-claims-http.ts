// Public OTP boundary. A submitted reward ID is only an issuance candidate;
// the database checks its ownership and live eligibility. Only verification
// can produce an opaque claim, and that claim still needs atomic reservation.
import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizePhoneE164 } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueLoyaltyChallenge } from './challenge-issuer'
import { verifyLoyaltyChallenge } from './claim-verifier'
import { readBody, respond } from './merchant-http'
import { getLoyaltyTrustedIp } from './public-ingress'
import { loadLoyaltyClaimCrypto } from './server-keys'

const uuid = z.string().length(36).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform(value => value.toLowerCase())
const phone = z.string().min(1).max(64).regex(/^[+0-9 ()-]+$/)
  .transform(value => normalizePhoneE164(value))
  .pipe(z.string().regex(/^\+639[0-9]{9}$/))
const issueSchema = z.object({ tenantId: uuid, entitlementId: uuid, phone }).strict()
const verifySchema = z.object({ tenantId: uuid, challengeId: uuid, phone, code: z.string().regex(/^[0-9]{6}$/) }).strict()

function preparation(request: NextRequest) {
  if (process.env.LOYALTY_PUBLIC_CLAIMS_ENABLED !== 'true' || process.env.LOYALTY_SMS_DELIVERY_ENABLED !== 'true') return null
  const trustedIp = getLoyaltyTrustedIp(request.headers)
  const crypto = loadLoyaltyClaimCrypto()
  return trustedIp && crypto ? { trustedIp, crypto } : null
}

function unavailable() {
  return respond({ error: 'Loyalty claims are not available yet.' }, 503)
}

async function jsonBody(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return respond({ error: 'A JSON request is required.' }, 415)
  }
  return readBody(request)
}

// Same floor and independent jitter for every well-formed request outcome.
// This reduces fast-path timing differences; it is not constant-time under
// database lock waits or outages. Edge flood controls remain a rollout task.
async function paced(start: number, body: unknown, status: number) {
  const delay = Math.max(0, 350 + randomInt(0, 101) - (performance.now() - start))
  if (delay) await new Promise<void>(resolve => setTimeout(resolve, delay))
  return respond(body, status)
}

export async function handlePublicClaimRequest(request: NextRequest): Promise<NextResponse> {
  const prepared = preparation(request)
  if (!prepared) return unavailable()
  const raw = await jsonBody(request)
  if (raw instanceof NextResponse) return raw
  const parsed = issueSchema.safeParse(raw)
  if (!parsed.success) return respond({ error: 'Invalid code request.' }, 400)
  const start = performance.now()
  let challengeId: string = randomUUID()
  try {
    const result = await issueLoyaltyChallenge({ ...parsed.data, trustedIp: prepared.trustedIp }, {
      crypto: prepared.crypto, database: createAdminClient(),
    })
    if (result.ok) challengeId = result.challengeId
  } catch {
    // Denials, quotas, missing rewards and storage failures share one response.
    // A decoy reference never creates a challenge, profile, or delivery job.
  }
  return paced(start, { accepted: true, challengeId, expiresInSeconds: 300 }, 202)
}

export async function handlePublicClaimVerify(request: NextRequest): Promise<NextResponse> {
  const prepared = preparation(request)
  if (!prepared) return unavailable()
  const raw = await jsonBody(request)
  if (raw instanceof NextResponse) return raw
  const parsed = verifySchema.safeParse(raw)
  if (!parsed.success) return respond({ error: 'The code could not be verified.' }, 400)
  const start = performance.now()
  try {
    const result = await verifyLoyaltyChallenge({ ...parsed.data, trustedIp: prepared.trustedIp }, {
      crypto: prepared.crypto, database: createAdminClient(),
    })
    if (result.ok) return paced(start, { token: result.token, expiresAt: result.expiresAt }, 200)
    if (result.error === 'invalid_claim') return paced(start, { error: 'The code could not be verified.' }, 400)
  } catch {
    // Never log submitted codes, phones, proofs, or generated claim tokens.
  }
  // Verification cannot safely be retried automatically: an uncertain commit
  // might already have consumed an attempt or the whole challenge. Recovery
  // across lost HTTP responses is a separate, still-disabled rollout task.
  return paced(start, { error: 'Verification could not be confirmed. Please request a new code.' }, 503)
}
