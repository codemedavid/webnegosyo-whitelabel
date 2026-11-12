import type { NextRequest } from 'next/server'
import { appRoute } from '@/lib/app-api/app-route'
import { handleGetOrder } from '@/lib/app-api/orders/orders-http'

/**
 * GET /api/app/v1/orders/<id> (Authorization: Bearer cs1.…) → AppOrderDetail
 * The caller's own app order only (anyone else's is 404); live status from the
 * order's backend, lines and totals from the snapshot taken when it was placed.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  return appRoute({ scope: 'order', rateLimit: { limit: 120, windowSec: 60 } }, (context) => handleGetOrder(context, id))(request)
}
