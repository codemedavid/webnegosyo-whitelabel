import { NextRequest, NextResponse } from 'next/server'
import { DELETION_ID_HEADER } from '@/lib/order-deletion/constants'
import { NO_STORE, errorResponse, readJsonBody } from '@/lib/order-deletion/http'
import { createOrderDeletionRepo } from '@/lib/order-deletion/repository'
import { resolveOwnerCaller } from '@/lib/order-deletion/request-caller'
import { parseDeletionRequest } from '@/lib/order-deletion/scope'
import { prepareExport } from '@/lib/order-deletion/service'

export const maxDuration = 60

/**
 * Step 1 of deletion: the backup file. The response body IS the CSV; the
 * deletion ticket id rides in a header, so the only way to obtain a ticket is
 * to receive the file that lists exactly the orders it covers.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 })

  const owner = await resolveOwnerCaller(request, body.tenantId, { isWrite: true })
  if (!owner.ok) return owner.response

  const parsed = parseDeletionRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const exported = await prepareExport(
      createOrderDeletionRepo(owner.admin),
      owner.caller,
      owner.store,
      parsed.value,
      new Date()
    )
    return new NextResponse(exported.csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exported.fileName}"`,
        [DELETION_ID_HEADER]: exported.deletionId,
        'X-Order-Count': String(exported.orderCount),
        'X-Order-Total': String(exported.orderTotal),
        'X-Export-Expires-At': exported.expiresAt,
        'X-Export-File-Name': exported.fileName,
      },
    })
  } catch (error) {
    return errorResponse(error, 'export')
  }
}
