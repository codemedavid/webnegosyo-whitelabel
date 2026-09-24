import { NextRequest, NextResponse } from 'next/server'
import { RECOVERY_DAYS } from '@/lib/order-deletion/constants'
import { NO_STORE, errorResponse } from '@/lib/order-deletion/http'
import { createOrderDeletionRepo } from '@/lib/order-deletion/repository'
import { resolveOwnerCaller } from '@/lib/order-deletion/request-caller'

const HISTORY_LIMIT = 20

/** The owner's recent deletions, newest first, with what can still be restored. */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId')
  const owner = await resolveOwnerCaller(request, tenantId, { isWrite: false })
  if (!owner.ok) return owner.response

  try {
    const deletions = await createOrderDeletionRepo(owner.admin).listDeletions(owner.caller.tenantId, HISTORY_LIMIT)
    return NextResponse.json({ deletions, recoveryDays: RECOVERY_DAYS }, { headers: NO_STORE })
  } catch (error) {
    return errorResponse(error, 'history')
  }
}
