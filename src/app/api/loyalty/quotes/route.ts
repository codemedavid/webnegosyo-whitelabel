import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  authenticateMerchant,
  readBody,
  respond,
} from '@/lib/loyalty/merchant-http'
import { loadLoyaltyClaimCrypto } from '@/lib/loyalty/server-keys'
import { hasPermission } from '@/lib/staff-permissions'
import {
  issueLoyaltyQuote,
  LoyaltyQuoteError,
} from '@/lib/loyalty/quote-issuer'
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
const schema = z
  .object({
    tenantId: uuid,
    requestId: uuid,
    claimToken: z.string().min(1).max(256),
    outletId: uuid.nullable(),
    orderTypeId: uuid,
    cart: z
      .object({
        lines: z
          .array(
            z
              .object({
                menuItemId: uuid,
                quantity: z.number().int().min(1).max(999),
                selectedOptionIds: z
                  .array(z.string().min(1).max(200))
                  .max(1000),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict(),
  })
  .strict()
const release = z.object({ tenantId: uuid, quoteId: uuid }).strict()
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.LOYALTY_POS_SETTLEMENT_ENABLED !== 'true')
    return respond({ error: 'Loyalty redemption is not available yet.' }, 503)
  const raw = await readBody(request)
  if (raw instanceof NextResponse) return raw
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return respond({ error: 'Invalid reward cart.' }, 400)
  try {
    const auth = await authenticateMerchant(request, parsed.data.tenantId)
    if (!auth.ok) return auth.response
    if (
      !hasPermission(auth.member, 'pos') ||
      !hasPermission(auth.member, 'loyalty_redeem')
    )
      return respond({ error: 'Forbidden' }, 403)
    const crypto = loadLoyaltyClaimCrypto()
    if (!crypto)
      return respond({ error: 'Loyalty redemption is not available yet.' }, 503)
    const claimHash = crypto.resolveClaim(
      parsed.data.tenantId,
      parsed.data.claimToken,
    )
    if (!claimHash) return respond({ error: 'Invalid claim QR.' }, 400)
    const admin: SupabaseClient = createAdminClient()
    const quote = await issueLoyaltyQuote(admin, {
      ...parsed.data,
      actor: auth.userId,
      claimHash,
    })
    return respond({ success: true, quote }, 200)
  } catch (error) {
    return respond(
      {
        error:
          error instanceof LoyaltyQuoteError
            ? error.message
            : 'Could not confirm the quote. Retry the same request.',
      },
      error instanceof LoyaltyQuoteError ? 409 : 503,
    )
  }
}
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  // Releasing an existing hold remains available if the rollout gate is turned off.
  const raw = await readBody(request)
  if (raw instanceof NextResponse) return raw
  const parsed = release.safeParse(raw)
  if (!parsed.success) return respond({ error: 'Invalid quote.' }, 400)
  try {
    const auth = await authenticateMerchant(request, parsed.data.tenantId)
    if (!auth.ok) return auth.response
    if (
      !hasPermission(auth.member, 'pos') ||
      !hasPermission(auth.member, 'loyalty_redeem')
    )
      return respond({ error: 'Forbidden' }, 403)
    const admin: SupabaseClient = createAdminClient()
    const { data, error } = await admin.rpc('release_loyalty_pos_quote', {
      p_tenant_id: parsed.data.tenantId,
      p_actor: auth.userId,
      p_quote_id: parsed.data.quoteId,
    })
    if (error) throw error
    return respond({ released: data === true }, 200)
  } catch {
    return respond(
      { error: 'Could not release this reward. Please retry.' },
      503,
    )
  }
}
