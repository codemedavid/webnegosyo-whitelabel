import { NextRequest, NextResponse } from 'next/server'
import { readBody } from '@/lib/loyalty/merchant-http'
import { authorizeLoyaltyMerchant, readTenantId } from '@/lib/loyalty/merchant-auth'
import { parseOrderCustomersRequest } from '@/lib/loyalty/order-customers'

/**
 * /api/loyalty/order-customers — which orders on this page belong to a known
 * customer, and what each order did to their stamp card.
 *
 *   POST { tenantId, backend, orders: [{ orderId, contact, customerData, status }] }
 *
 * POST rather than GET only because a page of orders does not fit a URL. It
 * reads, never writes. Same gate as `/api/loyalty/members`: the caller's own
 * token, the caller's own tenant, and `loyalty_manage` — the answer names
 * members and their balances, which that grant already shows in full.
 */

/** A page of orders with their contact fields; far above one page, far below abuse. */
const MAX_BODY_BYTES = 128 * 1024

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await readBody(request, MAX_BODY_BYTES)
  if (raw instanceof NextResponse) return raw
  const body = raw as Record<string, unknown> | null

  const tenantId = readTenantId(body?.tenantId)
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const caller = await authorizeLoyaltyMerchant(request, tenantId)
  if (caller instanceof NextResponse) return caller

  const parsed = parseOrderCustomersRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { readOrderCustomers } = await import('@/lib/loyalty/order-customer-repository')

  try {
    const result = await readOrderCustomers(createAdminClient(), tenantId, parsed.value)
    return NextResponse.json(
      { success: true, ...result },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order customers could not be read.'
    console.error('[loyalty/order-customers] POST', message)
    // A failed read must never render as "none of these customers are members".
    return NextResponse.json(
      { error: 'Customer details could not be loaded. Please retry.' },
      { status: 503 }
    )
  }
}
