// "Text me a code before you show my rewards": issuing the code, checking it,
// and checking the session it buys. Internal services, not HTTP handlers.
//
// Mirrors challenge-issuer / claim-verifier: proofs are derived here from one
// canonical phone, never accepted from a client, and trustedIp MUST come from
// the deployment's trusted ingress.
import 'server-only'
import { randomUUID } from 'node:crypto'
import { normalizePhoneE164 } from '@/lib/phone'
import type { createLoyaltyClaimCrypto } from './claim-crypto'

type Crypto = ReturnType<typeof createLoyaltyClaimCrypto>
type RpcResult = PromiseLike<{ data: unknown; error: unknown }>
export interface WalletRpcClient {
  rpc(name: string, args: Record<string, unknown>): RpcResult
}
interface Dependencies {
  crypto: Crypto
  database: WalletRpcClient
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const PH_MOBILE = /^\+639[0-9]{9}$/

function canonicalPhone(raw: string): string | null {
  const phone = normalizePhoneE164(raw)
  return phone && PH_MOBILE.test(phone) ? phone : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export type WalletIssueResult =
  | { ok: true; challengeId: string; expiresAt: string }
  | { ok: false; error: 'request_denied' | 'unavailable' }

export async function issueWalletChallenge(
  input: { tenantId: string; phone: string; trustedIp: string },
  { crypto, database }: Dependencies,
): Promise<WalletIssueResult> {
  const phone = canonicalPhone(input.phone)
  if (!phone || !UUID.test(input.tenantId)) return { ok: false, error: 'request_denied' }
  let args: Record<string, string>
  try {
    const context = { tenantId: input.tenantId, challengeId: randomUUID() }
    const code = crypto.generateCode()
    const proof = crypto.verificationProof(context, phone, code)
    args = {
      p_tenant_id: input.tenantId,
      p_challenge_id: context.challengeId,
      p_expected_customer_key: proof.customerKey,
      p_phone_hash: proof.phoneHash,
      p_code_hash: proof.codeHash,
      p_ip_hash: crypto.hashIp(input.trustedIp),
      p_payload_encrypted: crypto.encryptSms(context, { phone, code }),
    }
  } catch {
    return { ok: false, error: 'request_denied' }
  }
  // An uncertain commit is retried with the SAME code, id and ciphertext; the
  // database recognises the exact retry and never queues a second SMS.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await database.rpc('issue_loyalty_wallet_challenge', args)
      if (error) continue
      if (!isRecord(data)) return { ok: false, error: 'unavailable' }
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

export type WalletVerifyResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; error: 'invalid_code' | 'unavailable' }

export async function verifyWalletChallenge(
  input: { tenantId: string; challengeId: string; phone: string; code: string; trustedIp: string },
  { crypto, database }: Dependencies,
): Promise<WalletVerifyResult> {
  const phone = canonicalPhone(input.phone)
  if (!phone || !UUID.test(input.tenantId) || !UUID.test(input.challengeId) || !/^[0-9]{6}$/.test(input.code)) {
    return { ok: false, error: 'invalid_code' }
  }
  try {
    const proof = crypto.verificationProof({ tenantId: input.tenantId, challengeId: input.challengeId }, phone, input.code)
    // Its own committed transaction first, so a wrong guess always costs budget.
    // Shared with reward-claim verification: one guessing budget per number.
    const limit = await database.rpc('allow_loyalty_verification_attempt', {
      p_tenant_id: input.tenantId, p_phone_hash: proof.phoneHash, p_ip_hash: crypto.hashIp(input.trustedIp),
    })
    if (limit.error || !isRecord(limit.data)) return { ok: false, error: 'unavailable' }
    if (limit.data.ok !== true) return { ok: false, error: 'invalid_code' }
    const session = crypto.createWalletSession(input.tenantId)
    const response = await database.rpc('verify_loyalty_wallet_challenge', {
      p_tenant_id: input.tenantId, p_challenge_id: input.challengeId, p_candidate_code_hash: proof.codeHash,
      p_session_token_hash: session.tokenHash, p_expected_phone_hash: proof.phoneHash,
    })
    if (response.error || !isRecord(response.data)) return { ok: false, error: 'unavailable' }
    if (response.data.ok === false) return { ok: false, error: 'invalid_code' }
    if (response.data.ok !== true || typeof response.data.expiresAt !== 'string') return { ok: false, error: 'unavailable' }
    return { ok: true, token: session.token, expiresAt: response.data.expiresAt }
  } catch {
    // Never auto-retry: an uncertain verification may have used the code.
    return { ok: false, error: 'unavailable' }
  }
}

/** true/false from the database; null when it could not be asked. */
export async function isWalletSessionValid(
  input: { tenantId: string; phone: string; token: unknown },
  { crypto, database }: Dependencies,
): Promise<boolean | null> {
  const phone = canonicalPhone(input.phone)
  if (!phone) return false
  let tokenHash: string | null
  let phoneHash: string
  try {
    tokenHash = crypto.resolveWalletSession(input.tenantId, input.token)
    phoneHash = crypto.hashPhone(input.tenantId, phone)
  } catch {
    return false
  }
  if (!tokenHash) return false
  try {
    const { data, error } = await database.rpc('loyalty_wallet_session_valid', {
      p_tenant_id: input.tenantId, p_token_hash: tokenHash, p_phone_hash: phoneHash,
    })
    if (error || typeof data !== 'boolean') return null
    return data
  } catch {
    return null
  }
}
