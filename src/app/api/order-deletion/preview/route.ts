import { NextRequest, NextResponse } from 'next/server'
import { MAX_SELECTED_ORDERS } from '@/lib/order-deletion/constants'
import { NO_STORE, errorResponse, readJsonBody } from '@/lib/order-deletion/http'
import { createOrderDeletionRepo } from '@/lib/order-deletion/repository'
import { resolveOwnerCaller } from '@/lib/order-deletion/request-caller'
import { parseDeletionRequest } from '@/lib/order-deletion/scope'
import { previewDeletion } from '@/lib/order-deletion/service'

/**
 * What a scope would delete — counts only, or with `listOrders` the orders
 * themselves (capped) so the owner can pick individual ones. Reads nothing
 * the owner cannot already see in their own order list.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 })

  const owner = await resolveOwnerCaller(request, body.tenantId, { isWrite: true })
  if (!owner.ok) return owner.response

  const parsed = parseDeletionRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const repo = createOrderDeletionRepo(owner.admin)
    const preview = await previewDeletion(repo, owner.caller, parsed.value)
    if (body.listOrders !== true) return NextResponse.json({ preview }, { headers: NO_STORE })

    const orders = await repo.findOrdersForScope(owner.caller.tenantId, parsed.value.scope, parsed.value.includeActive)
    const listed = orders
      .slice(-MAX_SELECTED_ORDERS)
      .reverse()
      .map(({ id, created_at, daily_number, status, customer_name, total }) => ({
        id,
        created_at,
        daily_number,
        status,
        customer_name,
        total,
      }))
    return NextResponse.json(
      { preview, orders: listed, truncated: orders.length > MAX_SELECTED_ORDERS },
      { headers: NO_STORE }
    )
  } catch (error) {
    return errorResponse(error, 'preview')
  }
}
