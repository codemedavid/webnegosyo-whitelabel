import 'server-only'
import { z } from 'zod'
import { normalizePhoneE164 } from '@/lib/phone'
import type { createLoyaltyClaimCrypto } from './claim-crypto'

export type VerificationLimitArguments = { p_tenant_id: string; p_phone_hash: string; p_ip_hash: string }
export type ClaimVerificationArguments = {
  p_tenant_id: string
  p_challenge_id: string
  p_candidate_code_hash: string
  p_claim_token_hash: string
  p_expected_customer_key: string
  p_expected_phone_hash: string
}
type Dependencies = {
  crypto: ReturnType<typeof createLoyaltyClaimCrypto>
  database: {
    rpc(name: 'allow_loyalty_verification_attempt', args: VerificationLimitArguments): PromiseLike<{ data: unknown; error: unknown }>
    rpc(name: 'verify_loyalty_claim', args: ClaimVerificationArguments): PromiseLike<{ data: unknown; error: unknown }>
  }
  now?: () => number
}
type VerifyInput = { tenantId: string; challengeId: string; phone: string; code: string; trustedIp: string }
type VerifyResult = { ok: true; token: string; expiresAt: string } | { ok: false; error: 'invalid_claim' | 'unavailable' }
const uuidSchema = z.string().length(36).regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i).transform(value => value.toLowerCase())
const inputSchema = z.object({
  tenantId: uuidSchema,
  challengeId: uuidSchema,
  phone: z.string().min(1).max(64).regex(/^[+0-9 ()-]+$/),
  code: z.string().length(6).regex(/^[0-9]{6}$/),
  trustedIp: z.string().min(1).max(45),
}).strict()
const deniedSchema = z.object({ ok: z.literal(false), error: z.literal('invalid_claim') }).strict()
const limitSchema = z.discriminatedUnion('ok', [z.object({ ok: z.literal(true) }).strict(), deniedSchema])
const resultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), claimId: uuidSchema, expiresAt: z.string().datetime({ offset: true }) }).strict(),
  deniedSchema,
])

// trustedIp comes from trusted ingress. Each RPC MUST commit in its own transaction:
// the rate event survives a downstream error. Neither RPC is safe to auto-retry.
export async function verifyLoyaltyChallenge(rawInput: VerifyInput, { crypto, database, now = Date.now }: Dependencies): Promise<VerifyResult> {
  const parsed = inputSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: 'invalid_claim' }
  const input = parsed.data
  const phone = normalizePhoneE164(input.phone)
  if (!phone || !/^\+639[0-9]{9}$/.test(phone)) return { ok: false, error: 'invalid_claim' }
  let ipHash: string
  try { ipHash = crypto.hashIp(input.trustedIp) } catch { return { ok: false, error: 'invalid_claim' } }
  try {
    const proof = crypto.verificationProof({ tenantId: input.tenantId, challengeId: input.challengeId }, phone, input.code)
    const limitResponse = await database.rpc('allow_loyalty_verification_attempt', {
      p_tenant_id: input.tenantId, p_phone_hash: proof.phoneHash, p_ip_hash: ipHash,
    })
    if (limitResponse.error) return { ok: false, error: 'unavailable' }
    const limit = limitSchema.safeParse(limitResponse.data)
    if (!limit.success) return { ok: false, error: 'unavailable' }
    if (!limit.data.ok) return limit.data
    const claim = crypto.createClaim(input.tenantId)
    const response = await database.rpc('verify_loyalty_claim', {
      p_tenant_id: input.tenantId, p_challenge_id: input.challengeId,
      p_candidate_code_hash: proof.codeHash, p_claim_token_hash: claim.tokenHash,
      p_expected_customer_key: proof.customerKey, p_expected_phone_hash: proof.phoneHash,
    })
    if (response.error) return { ok: false, error: 'unavailable' }
    const result = resultSchema.safeParse(response.data)
    if (!result.success) return { ok: false, error: 'unavailable' }
    if (!result.data.ok) return result.data
    const currentTime = now()
    const expiry = Date.parse(result.data.expiresAt)
    if (!Number.isFinite(currentTime) || expiry <= currentTime || expiry > currentTime + 120_000) {
      return { ok: false, error: 'unavailable' }
    }
    return { ok: true, token: claim.token, expiresAt: result.data.expiresAt }
  } catch {
    // An uncertain verification may have consumed the OTP. Never expose a token
    // without confirmed storage success; HTTP lost-response recovery is pending.
    return { ok: false, error: 'unavailable' }
  }
}
