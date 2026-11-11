import { NextResponse } from 'next/server'
import { z } from 'zod'
import { defineRoute } from '@/platform/http/define-route'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const querySchema = z.object({ tenantId: z.string().regex(UUID_RE) })

/**
 * GET /api/gov-discounts/approvers?tenantId=…&outletId=…
 *
 * Who may approve a Senior/PWD discount at this branch, for the register's
 * picker: names and whether each has set a PIN. Nothing else about them —
 * and only to someone who rings up sales (`pos`), since the list tells a
 * reader whose PIN guards the discounts.
 *
 * `branch: 'any'`: `outletId` is a filter on the list, as it has always been.
 */
export const GET = defineRoute({
  auth: {
    kind: 'staff',
    session: 'bearer',
    permission: 'pos',
    branch: 'any',
    access: 'view',
    storeClaim: ({ query }) => query.tenantId,
  },
  query: querySchema,
  // The sentences the register already shows for these two refusals.
  onRefusal: (refusal) => {
    if (refusal.code === 'invalid') return NextResponse.json({ error: 'A valid tenantId is required.' }, { status: 400 })
    if (refusal.code === 'permission') return NextResponse.json({ error: 'You do not have permission for this.' }, { status: 403 })
    return undefined
  },
  handler: async ({ request, tenant }) => {
    const outletParam = request.nextUrl.searchParams.get('outletId')
    const outletId = outletParam && UUID_RE.test(outletParam) ? outletParam : null

    const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
    const { createSupabaseApprovalStore } = await import('@/lib/gov-discount-ledger/supabase-approval-store')
    const { listApprovers } = await import('@/lib/gov-discount-ledger/approval-service')

    try {
      const store = createSupabaseApprovalStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }))
      const approvers = await listApprovers(store, tenant, outletId)
      return NextResponse.json({ success: true, approvers })
    } catch (error) {
      console.error('[gov-discounts/approvers] failed', error instanceof Error ? error.message : error)
      return NextResponse.json({ error: 'Could not load managers.' }, { status: 500 })
    }
  },
})
