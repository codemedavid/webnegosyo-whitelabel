import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeLoyaltyMerchant } from '@/lib/loyalty/merchant-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLoyaltyActivity } from '@/lib/loyalty/activity-repository'
import { LOYALTY_ACTIVITY_KINDS } from '@/lib/loyalty/activity'
import { respond } from '@/lib/loyalty/merchant-http'

const instant = z.string().datetime({ offset: true })
const cursor = z.string().max(100).refine(value => {
  const pieces = value.split('|')
  return pieces.length === 2 && instant.safeParse(pieces[0]).success && z.string().uuid().safeParse(pieces[1]).success
})
const querySchema = z.object({
  tenantId: z.string().uuid(), limit: z.coerce.number().int().min(1).max(100).default(30),
  kind: z.enum(LOYALTY_ACTIVITY_KINDS).optional(),
  customerKey: z.string().min(1).max(160).optional(), programId: z.string().uuid().optional(),
  outletId: z.string().uuid().optional(), from: instant.optional(), to: instant.optional(), cursor: cursor.optional(),
}).refine(value => !value.from || !value.to || Date.parse(value.from) < Date.parse(value.to))

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return respond({ error: 'Invalid activity filters.' }, 400)
  const { tenantId, ...filters } = parsed.data
  const caller = await authorizeLoyaltyMerchant(request, tenantId)
  if (caller instanceof NextResponse) return caller
  try {
    return respond(await readLoyaltyActivity(createAdminClient(), tenantId, filters), 200)
  } catch {
    return respond({ error: 'Activity could not be loaded. Please try again.' }, 503)
  }
}
