import { NextRequest, NextResponse } from 'next/server'
import { authenticateMerchant, isRecord, isUuid, readBody, respond } from '@/lib/loyalty/merchant-http'
import { hasPermission } from '@/lib/staff-permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { loadAndPriceOrderLines } from '@/lib/checkout/load-line-pricing'

/** A scanner must verify combo prices against this store's definitions. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readBody(request, 128 * 1024)
  if (body instanceof NextResponse) return body
  if (!isRecord(body) || !isUuid(body.tenantId) || (body.outletId != null && !isUuid(body.outletId))) {
    return respond({ error: 'Invalid store or branch.' }, 400)
  }
  const auth = await authenticateMerchant(request, body.tenantId)
  if (!auth.ok) return auth.response
  if (!hasPermission(auth.member, 'orders') && !hasPermission(auth.member, 'pos')) {
    return respond({ error: 'Forbidden' }, 403)
  }
  const parsed = parseOrderLines(body.items)
  if (!parsed.ok) return respond({ error: parsed.error }, 400)
  const pinnedOutlet = auth.member.role !== 'superadmin' && !auth.member.is_owner ? auth.member.outlet_id : null
  if (pinnedOutlet && body.outletId != null && body.outletId !== pinnedOutlet) {
    return respond({ error: 'This account belongs to a different branch.' }, 403)
  }
  const outletId = pinnedOutlet ?? (body.outletId as string | null | undefined) ?? null
  try {
    const client = createAdminClient()
    if (outletId) {
      const { data, error } = await client.from('outlets').select('id')
        .eq('tenant_id', body.tenantId).eq('id', outletId).eq('is_active', true).maybeSingle()
      if (error) return respond({ error: 'Could not verify the branch.' }, 503)
      if (!data) return respond({ error: 'This branch is not available.' }, 422)
    }
    const priced = await loadAndPriceOrderLines(
      client, body.tenantId,
      parsed.lines.map((line, sourceIndex) => ({ ...line, sourceIndex })),
      outletId,
    )
    if (!priced.ok) return respond({ error: priced.error }, priced.refused ? 422 : 503)
    return respond({ lines: priced.lines, total: priced.itemsSubtotal }, 200)
  } catch {
    return respond({ error: 'Could not verify this cart. Please scan again.' }, 503)
  }
}
