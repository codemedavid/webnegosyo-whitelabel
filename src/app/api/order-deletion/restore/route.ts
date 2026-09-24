import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NO_STORE, errorResponse, readJsonBody } from '@/lib/order-deletion/http'
import { createOrderDeletionRepo } from '@/lib/order-deletion/repository'
import { resolveOwnerCaller } from '@/lib/order-deletion/request-caller'
import { restoreDeletion } from '@/lib/order-deletion/service'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

const RESTORE_TIMEOUT_MS = 45_000

const restoreSchema = z.object({ deletionId: z.string().uuid() })

/** Put a deletion's orders back while the recovery window is open. */
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 })

  const owner = await resolveOwnerCaller(request, body.tenantId, { isWrite: true })
  if (!owner.ok) return owner.response

  const parsed = restoreSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'A valid deletion id is required.' }, { status: 400 })

  try {
    const repo = createOrderDeletionRepo(createAdminClient({ timeoutMs: RESTORE_TIMEOUT_MS }))
    const result = await restoreDeletion(repo, owner.caller, parsed.data.deletionId, new Date())
    return NextResponse.json({ result }, { headers: NO_STORE })
  } catch (error) {
    return errorResponse(error, 'restore')
  }
}
