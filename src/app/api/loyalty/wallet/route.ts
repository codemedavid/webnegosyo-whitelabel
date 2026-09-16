import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneE164 } from '@/lib/phone'
import { getLoyaltyTrustedIp } from '@/lib/loyalty/public-ingress'
import { loadLoyaltyClaimCrypto } from '@/lib/loyalty/server-keys'
import { readBody, respond } from '@/lib/loyalty/merchant-http'
import { parseLoyaltyRules } from '@/lib/loyalty/rules'
import { describeLoyaltyReward } from '@/lib/loyalty/offer'

const schema = z
  .object({
    tenantId: z.string().uuid(),
    phone: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[+0-9 ()-]+$/),
  })
  .strict()
export async function POST(request: NextRequest): Promise<NextResponse> {
  const crypto = loadLoyaltyClaimCrypto()
  const ip = getLoyaltyTrustedIp(request.headers)
  if (!crypto || !ip)
    return respond({ error: 'Loyalty lookup is not available yet.' }, 503)
  const raw = await readBody(request)
  if (raw instanceof NextResponse) return raw
  const parsed = schema.safeParse(raw)
  const phone = parsed.success ? normalizePhoneE164(parsed.data.phone) : null
  if (!parsed.success || !phone || !/^\+639[0-9]{9}$/.test(phone))
    return respond({ error: 'Enter a valid Philippine mobile number.' }, 400)
  try {
    const tenantId = parsed.data.tenantId.toLowerCase()
    const admin: SupabaseClient = createAdminClient()
    const { data, error } = await admin.rpc('lookup_loyalty_wallet', {
      p_tenant_id: tenantId,
      p_customer_key: `phone:${phone}`,
      p_phone_hash: crypto.hashPhone(tenantId, phone),
      p_ip_hash: crypto.hashIp(ip),
    })
    if (error || !data) throw new Error('Lookup unavailable')
    if (!data.ok)
      return respond(
        { error: 'Too many lookups. Please try again later.' },
        429,
      )
    // Explicit projections prevent a future database field from exposing profiles.
    const programs = (data.programs as Record<string, unknown>[]).map((row) => {
      const rules = parseLoyaltyRules(row.rules)
      if (!rules.ok) throw new Error('Invalid rules')
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        branchName: row.branchName,
        earnMode: rules.value.earnMode,
        threshold: rules.value.threshold,
        balance: Number(row.balance),
        rewardLabel: describeLoyaltyReward(rules.value.reward),
        minSpend: rules.value.minSpend,
      }
    })
    const rewards = (data.rewards as Record<string, unknown>[]).map((row) => {
      const terms = row.terms as Record<string, unknown>
      const rules = parseLoyaltyRules({
        earnMode: 'stamp',
        threshold: 1,
        reward: terms?.reward,
      })
      if (!rules.ok) throw new Error('Invalid reward')
      return {
        id: row.id,
        programName: terms.programName,
        label: describeLoyaltyReward(rules.value.reward),
        expiresAt: row.expiresAt,
        branchName: row.branchName,
        freeItem: rules.value.reward.type === 'free_item',
      }
    })
    const claimsAvailable =
      process.env.LOYALTY_PUBLIC_CLAIMS_ENABLED === 'true' &&
      process.env.LOYALTY_SMS_DELIVERY_ENABLED === 'true' &&
      process.env.LOYALTY_POS_SETTLEMENT_ENABLED === 'true'
    return respond({ programs, rewards, claimsAvailable }, 200)
  } catch {
    return respond(
      { error: 'Could not load your rewards. Please try again.' },
      503,
    )
  }
}
