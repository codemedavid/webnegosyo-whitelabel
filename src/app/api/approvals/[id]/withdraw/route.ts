import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { resolveApprovalsCaller } from '@/lib/approvals/access'
import { firstIssue, tenantOnlySchema } from '@/lib/approvals/schemas'
import { withdrawApproval } from '@/lib/approvals/service'
import { badRequest, buildApprovalsContext, readJson, respond, serverError } from '@/lib/approvals/route-kit'

/** POST /api/approvals/:id/withdraw { tenantId } — the requester takes back a request still pending. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withRequestBearer(request, () => handle(request, context))
}

async function handle(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const parsed = tenantOnlySchema.safeParse(await readJson(request))
  if (!parsed.success) return badRequest(firstIssue(parsed.error))
  if (!z.string().uuid().safeParse(id).success) return badRequest('Invalid request.')

  const caller = await resolveApprovalsCaller(request, parsed.data.tenantId)
  if (!caller.ok) return caller.response
  try {
    return respond(await withdrawApproval(buildApprovalsContext(caller.actor, caller.tenantId), id))
  } catch (error) {
    return serverError('withdraw', error)
  }
}
