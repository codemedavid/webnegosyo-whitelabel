import { NextRequest, NextResponse } from 'next/server'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { resolveApprovalsCaller } from '@/lib/approvals/access'
import { firstIssue, rulesUpdateSchema, tenantOnlySchema } from '@/lib/approvals/schemas'
import { getApprovalRules, updateApprovalRules } from '@/lib/approvals/service'
import { badRequest, buildApprovalsContext, readJson, respond, serverError } from '@/lib/approvals/route-kit'

/**
 * GET /api/approvals/rules?tenantId=… — the store's limits (any account of the
 *   store: the request sheet needs them) + who can approve.
 * PUT /api/approvals/rules — owner only; recorded as rules.changed (before/after).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleGet(request))
}

export function PUT(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handlePut(request))
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const parsed = tenantOnlySchema.safeParse({ tenantId: request.nextUrl.searchParams.get('tenantId') ?? undefined })
  if (!parsed.success) return badRequest(firstIssue(parsed.error))
  const caller = await resolveApprovalsCaller(request, parsed.data.tenantId)
  if (!caller.ok) return caller.response
  try {
    return respond(await getApprovalRules(buildApprovalsContext(caller.actor, caller.tenantId)))
  } catch (error) {
    return serverError('rules read', error)
  }
}

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const parsed = rulesUpdateSchema.safeParse(await readJson(request))
  if (!parsed.success) return badRequest(firstIssue(parsed.error))
  const caller = await resolveApprovalsCaller(request, parsed.data.tenantId, 'write')
  if (!caller.ok) return caller.response
  try {
    return respond(await updateApprovalRules(buildApprovalsContext(caller.actor, caller.tenantId), parsed.data))
  } catch (error) {
    return serverError('rules write', error)
  }
}
