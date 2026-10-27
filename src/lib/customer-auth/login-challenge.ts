// Customer-app sign-in: issuing the text code, checking it, and the App
// Review shortcut. Internal services, not HTTP handlers — mirrors
// loyalty/wallet-verification.ts. Every proof is derived here from one
// canonical phone; nothing a client sends is trusted as a hash, and trustedIp
// MUST come from the deployment's trusted ingress.
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'
import { normalizePhoneE164 } from '@/lib/phone'
import { createAppSessionToken } from './session-token'

type Crypto = ReturnType<typeof createLoyaltyClaimCrypto>
export interface LoginRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}
interface Dependencies {
  crypto: Crypto
  database: LoginRpcClient
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const PH_MOBILE = /^\+639[0-9]{9}$/
const DEFAULT_RETRY_SECONDS = 60
const MAX_RETRY_SECONDS = 86_400

export function canonicalLoginPhone(raw: string): string | null {
  const phone = normalizePhoneE164(raw)
  return phone && PH_MOBILE.test(phone) ? phone : null
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function retrySeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RETRY_SECONDS
  return Math.min(MAX_RETRY_SECONDS, Math.max(1, Math.ceil(value)))
}

export type LoginIssueResult =
  | { ok: true; challengeId: string; expiresAt: string }
  | { ok: false; error: 'request_denied' | 'unavailable' }
  | { ok: false; error: 'rate_limited'; retryAfterSeconds: number }

/**
 * The App Review number's "send me a code": nothing is texted, but it is
 * counted and limited exactly like a real request, so the number can't be
 * told apart by its rate limits.
 */
export async function noteReviewRequest(
  input: { tenantId: string; phone: string; trustedIp: string },
  { crypto, database }: Dependencies,
): Promise<Exclude<LoginIssueResult, { ok: true }> | { ok: true }> {
  const phone = canonicalLoginPhone(input.phone)
  if (!phone || !UUID.test(input.tenantId)) return { ok: false, error: 'request_denied' }
  try {
    const { data, error } = await database.rpc('note_customer_login_review_request', {
      p_tenant_id: input.tenantId,
      p_phone_hash: crypto.hashPhone(input.tenantId, phone),
      p_ip_hash: crypto.hashNetwork(input.trustedIp),
    })
    if (error || !isRecord(data)) return { ok: false, error: 'unavailable' }
    if (data.ok === false && data.error === 'rate_limited') {
      return { ok: false, error: 'rate_limited', retryAfterSeconds: retrySeconds(data.retryAfterSeconds) }
    }
    return data.ok === true ? { ok: true } : { ok: false, error: 'request_denied' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function issueLoginChallenge(
  input: { tenantId: string; phone: string; trustedIp: string },
  { crypto, database }: Dependencies,
): Promise<LoginIssueResult> {
  const phone = canonicalLoginPhone(input.phone)
  if (!phone || !UUID.test(input.tenantId)) return { ok: false, error: 'request_denied' }
  let args: Record<string, string>
  try {
    const context = { tenantId: input.tenantId, challengeId: randomUUID() }
    const code = crypto.generateCode()
    const proof = crypto.verificationProof(context, phone, code)
    args = {
      p_tenant_id: input.tenantId,
      p_challenge_id: context.challengeId,
      p_phone_hash: proof.phoneHash,
      p_code_hash: proof.codeHash,
      p_ip_hash: crypto.hashNetwork(input.trustedIp),
      p_payload_encrypted: crypto.encryptSms(context, { phone, code }),
    }
  } catch {
    return { ok: false, error: 'request_denied' }
  }
  // An uncertain commit is retried with the SAME code, id and ciphertext; the
  // database recognises the exact retry and never queues a second SMS.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await database.rpc('issue_customer_login_challenge', args)
      if (error) continue
      if (!isRecord(data)) return { ok: false, error: 'unavailable' }
      if (data.ok === false && data.error === 'rate_limited') {
        return { ok: false, error: 'rate_limited', retryAfterSeconds: retrySeconds(data.retryAfterSeconds) }
      }
      if (data.ok === false) return { ok: false, error: 'request_denied' }
      if (data.ok !== true || data.challengeId !== args.p_challenge_id || typeof data.expiresAt !== 'string') {
        return { ok: false, error: 'unavailable' }
      }
      return { ok: true, challengeId: args.p_challenge_id, expiresAt: data.expiresAt }
    } catch {
      // retry once with identical arguments
    }
  }
  return { ok: false, error: 'unavailable' }
}

export interface OpenedSession {
  ok: true
  token: string
  customerId: string
  isNewCustomer: boolean
  name: string | null
  phoneE164: string
}
export type LoginVerifyResult = OpenedSession | { ok: false; error: 'invalid_code' | 'unavailable' }

function openedFrom(data: unknown, token: string): LoginVerifyResult {
  if (!isRecord(data)) return { ok: false, error: 'unavailable' }
  if (data.ok === false) return { ok: false, error: data.error === 'unavailable' ? 'unavailable' : 'invalid_code' }
  if (data.ok !== true || typeof data.customerId !== 'string' || typeof data.isNewCustomer !== 'boolean'
    || typeof data.phoneE164 !== 'string' || !(data.name === null || typeof data.name === 'string')) {
    return { ok: false, error: 'unavailable' }
  }
  return { ok: true, token, customerId: data.customerId, isNewCustomer: data.isNewCustomer, name: data.name, phoneE164: data.phoneE164 }
}

export async function verifyLoginChallenge(
  input: { tenantId: string; challengeId: string; phone: string; code: string; trustedIp: string },
  { crypto, database }: Dependencies,
): Promise<LoginVerifyResult> {
  const phone = canonicalLoginPhone(input.phone)
  if (!phone || !UUID.test(input.tenantId) || !UUID.test(input.challengeId) || !/^[0-9]{6}$/.test(input.code)) {
    return { ok: false, error: 'invalid_code' }
  }
  try {
    const proof = crypto.verificationProof({ tenantId: input.tenantId, challengeId: input.challengeId }, phone, input.code)
    // Its own committed transaction first, so a wrong guess always costs budget.
    // Shared with reward claims and the rewards page: one guessing budget per number.
    const limit = await database.rpc('allow_loyalty_verification_attempt', {
      p_tenant_id: input.tenantId, p_phone_hash: proof.phoneHash, p_ip_hash: crypto.hashNetwork(input.trustedIp),
    })
    if (limit.error || !isRecord(limit.data)) return { ok: false, error: 'unavailable' }
    if (limit.data.ok !== true) return { ok: false, error: 'invalid_code' }
    const session = createAppSessionToken()
    const response = await database.rpc('verify_customer_login_challenge', {
      p_tenant_id: input.tenantId, p_challenge_id: input.challengeId, p_candidate_code_hash: proof.codeHash,
      p_session_token_hash: session.tokenHash, p_expected_phone_hash: proof.phoneHash, p_phone_e164: phone,
    })
    if (response.error) return { ok: false, error: 'unavailable' }
    return openedFrom(response.data, session.token)
  } catch {
    // Never auto-retry: an uncertain verification may have used the code.
    return { ok: false, error: 'unavailable' }
  }
}

/**
 * App Review: the store's allow-listed number with its fixed code opens a
 * session without a text. The database honours it only while the app is a
 * draft and logs every attempt.
 */
export async function openReviewSession(
  input: { tenantId: string; phone: string; code: string; trustedIp: string },
  { crypto, database }: Dependencies,
): Promise<LoginVerifyResult> {
  const phone = canonicalLoginPhone(input.phone)
  if (!phone || !UUID.test(input.tenantId) || !/^[0-9]{6}$/.test(input.code)) return { ok: false, error: 'invalid_code' }
  try {
    const session = createAppSessionToken()
    const { data, error } = await database.rpc('open_customer_app_review_session', {
      p_tenant_id: input.tenantId,
      p_phone_e164: phone,
      p_phone_hash: crypto.hashPhone(input.tenantId, phone),
      p_candidate_code_hash: crypto.hashAppReviewCode(input.tenantId, input.code),
      p_session_token_hash: session.tokenHash,
      p_ip_hash: crypto.hashNetwork(input.trustedIp),
    })
    if (error) return { ok: false, error: 'unavailable' }
    return openedFrom(data, session.token)
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
