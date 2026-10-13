import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { resolveApprovalsCaller } from '@/lib/approvals/access'
import { firstIssue, tenantOnlySchema } from '@/lib/approvals/schemas'
import { getApproval } from '@/lib/approvals/service'
import { badRequest, buildApprovalsContext, respond, serverError } from '@/lib/approvals/route-kit'

/** GET /api/approvals/:id?tenantId=… — one request, if the caller may see it (else 404). */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withRequestBearer(request, () => handle(request, context))
}

async function handle(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const parsed = tenantOnlySchema.safeParse({ tenantId: request.nextUrl.searchParams.get('tenantId') ?? undefined })
  if (!parsed.success) return badRequest(firstIssue(parsed.error))
  if (!z.string().uuid().safeParse(id).success) return badRequest('Invalid request.')

  const caller = await resolveApprovalsCaller(request, parsed.data.tenantId)
  if (!caller.ok) return caller.response
  try {
    return respond(await getApproval(buildApprovalsContext(caller.actor, caller.tenantId), id))
  } catch (error) {
    return serverError('get', error)
  }
}
