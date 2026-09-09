import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { normalizePhoneE164 } from '@/lib/phone'
import type { createLoyaltyClaimCrypto } from './claim-crypto'

export type ChallengeIssueArguments = {
  p_tenant_id: string
  p_challenge_id: string
  p_entitlement_id: string
  p_expected_customer_key: string
  p_phone_hash: string
  p_code_hash: string
  p_ip_hash: string
  p_payload_encrypted: string
}

type Dependencies = {
  crypto: ReturnType<typeof createLoyaltyClaimCrypto>
  database: {
    rpc(name: 'issue_loyalty_challenge', args: ChallengeIssueArguments): PromiseLike<{ data: unknown; error: unknown }>
  }
}
type IssueInput = { tenantId: string; entitlementId: string; phone: string; trustedIp: string }
type IssueResult = { ok: true; challengeId: string; expiresAt: string } | { ok: false; error: 'request_denied' | 'unavailable' }
const uuidSchema = z.string().length(36).regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i).transform(value => value.toLowerCase())
const inputSchema = z.object({
  tenantId: uuidSchema,
  entitlementId: uuidSchema,
  phone: z.string().min(1).max(64).regex(/^[+0-9 ()-]+$/),
  trustedIp: z.string().min(1).max(45),
}).strict()
const resultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), challengeId: uuidSchema, expiresAt: z.string().datetime({ offset: true }) }),
  z.object({ ok: z.literal(false), error: z.literal('request_denied') }),
])

// Internal service, not an HTTP handler. trustedIp MUST come from the deployment's
// trusted ingress, never a freely supplied request body or forwarded-header chain.
export async function issueLoyaltyChallenge(rawInput: IssueInput, { crypto, database }: Dependencies): Promise<IssueResult> {
  const parsed = inputSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: 'request_denied' }
  const input = parsed.data
  const phone = normalizePhoneE164(input.phone)
  if (!phone || !/^\+639[0-9]{9}$/.test(phone)) return { ok: false, error: 'request_denied' }
  let ipHash: string
  try { ipHash = crypto.hashIp(input.trustedIp) } catch { return { ok: false, error: 'request_denied' } }
  let args: ChallengeIssueArguments
  try {
    const context = { tenantId: input.tenantId, challengeId: randomUUID() }
    const code = crypto.generateCode()
    const proof = crypto.verificationProof(context, phone, code)
    args = {
      p_tenant_id: input.tenantId,
      p_challenge_id: context.challengeId,
      p_entitlement_id: input.entitlementId,
      p_expected_customer_key: proof.customerKey,
      p_phone_hash: proof.phoneHash,
      p_code_hash: proof.codeHash,
      p_ip_hash: ipHash,
      p_payload_encrypted: crypto.encryptSms(context, { phone, code }),
    }
  } catch { return { ok: false, error: 'unavailable' } }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await database.rpc('issue_loyalty_challenge', args)
      if (error) continue
      const result = resultSchema.safeParse(data)
      if (!result.success || (result.data.ok && result.data.challengeId !== args.p_challenge_id)) {
        return { ok: false, error: 'unavailable' }
      }
      return result.data
    } catch {
      // An uncertain commit must reuse the same code, UUID, and ciphertext.
    }
  }
  return { ok: false, error: 'unavailable' }
}
