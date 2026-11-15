import { NextResponse } from 'next/server'
import { ExportError } from '@/lib/exports/errors'
import { templateActionSchema } from '@/lib/exports/report-templates'
import { removeReportTemplate, saveReportTemplate } from '@/lib/exports/server/report-templates'
import { defineRoute } from '@/platform/http/define-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status, headers: NO_STORE })
}

/**
 * POST /api/exports/formats — keep a report as a saved format ("My
 * formats"), or remove one. `{ action: 'save', tenantId, name, spec }` (a
 * custom report) / `{ action: 'save_format', tenantId, name, spec }` (the
 * owner's own layout) / `{ action: 'remove', tenantId, id }`.
 *
 * A format is a SHAPE (which sheet, which columns, filters, sort), never a
 * figure. It is written as the CALLER (cookie session or the app's Bearer
 * token): the table's RLS admits store-wide accounts with `reports`, which is
 * also what this entry declares. Owl never calls this: the owner's tap on the
 * file card does.
 */
export const POST = defineRoute({
  auth: { kind: 'staff', permission: 'reports', branch: 'store-wide', storeClaim: ({ body }) => body.tenantId },
  rateLimit: { bucket: 'exports-formats', per: 'user', max: 20, window: '1m' },
  body: templateActionSchema,
  handler: async ({ tenant, user, body }) => {
    try {
      if (body.action === 'remove') {
        await removeReportTemplate(tenant, body.id)
        return NextResponse.json({ success: true }, { headers: NO_STORE })
      }
      const shape = body.action === 'save' ? { kind: 'custom' as const, spec: body.spec } : { kind: 'format' as const, spec: body.spec }
      const saved = await saveReportTemplate({ tenantId: tenant, userId: user.id, name: body.name, shape })
      return NextResponse.json({ success: true, format: { id: saved.id, name: saved.name } }, { headers: NO_STORE })
    } catch (error) {
      if (error instanceof ExportError) return fail(error.status, error.message)
      console.error('[exports] saved format write failed', error instanceof Error ? error.message : error)
      return fail(500, 'That could not be saved. Try again in a moment.')
    }
  },
})
