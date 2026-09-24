import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NO_STORE, errorResponse, readJsonBody } from '@/lib/order-deletion/http'
import { verifyAccountPassword } from '@/lib/order-deletion/reauth'
import { createOrderDeletionRepo } from '@/lib/order-deletion/repository'
import { resolveOwnerCaller } from '@/lib/order-deletion/request-caller'
import { confirmDeletion } from '@/lib/order-deletion/service'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

/** Deleting thousands of orders with their archive can outlast the 8s read budget. */
const DELETE_TIMEOUT_MS = 45_000

const confirmSchema = z.object({
  deletionId: z.string().uuid(),
  password: z.string().min(1, 'Enter your password.').max(512),
  confirmation: z.string().min(1, 'Type the store name to confirm.').max(300),
})

/** Step 2: the store name, the owner's password, then the deletion itself. */
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 })

  const owner = await resolveOwnerCaller(request, body.tenantId, { isWrite: true })
  if (!owner.ok) return owner.response

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  try {
    const repo = createOrderDeletionRepo(createAdminClient({ timeoutMs: DELETE_TIMEOUT_MS }))
    const result = await confirmDeletion(
      repo,
      verifyAccountPassword,
      owner.caller,
      owner.store,
      parsed.data,
      new Date()
    )
    return NextResponse.json({ result }, { headers: NO_STORE })
  } catch (error) {
    return errorResponse(error, 'confirm')
  }
}
