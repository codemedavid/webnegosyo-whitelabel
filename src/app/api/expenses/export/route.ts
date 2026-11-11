import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyTenantPermission } from '@/lib/admin-service'
import { SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { createClient } from '@/lib/supabase/server'
import { buildExportRows, buildMonthlySummary, exportRowsToCsv } from '@/lib/expenses/export'
import { expenseExportFileName, loadExpenseExport } from '@/lib/expenses/read/export-read'
import { dateWindowSchema, firstIssueMessage } from '@/lib/expenses/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type ExportFormat = 'csv' | 'xlsx'

function plain(message: string, status: number): NextResponse {
  return new NextResponse(message, { status, headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' } })
}

/** `outletId` absent = every branch the caller reaches; `store` = store-wide rows only. */
function readOutletParam(raw: string | null): string | null | undefined | 'invalid' {
  if (raw === null || raw === '') return undefined
  if (raw === 'store') return null
  return UUID_RE.test(raw) ? raw : 'invalid'
}

/**
 * GET /api/expenses/export?tenantId=…&from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|xlsx[&outletId=<uuid>|store]
 *
 * The accountant export (cookie session or the app's Bearer token): one row
 * per expense, void rows included; the xlsx adds a monthly summary sheet. Read
 * with the CALLER's session, so RLS decides what is in the file. Needs the
 * `expenses` key; at most 400 days. An incomplete read is refused rather than
 * handed over as if it were the whole period.
 */
export function GET(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleExport(request))
}

async function handleExport(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const tenantId = params.get('tenantId') ?? ''
  const format = (params.get('format') ?? 'csv') as ExportFormat
  const outletId = readOutletParam(params.get('outletId'))
  if (!UUID_RE.test(tenantId)) return plain('A valid store is required.', 400)
  if (format !== 'csv' && format !== 'xlsx') return plain('Choose CSV or Excel.', 400)
  if (outletId === 'invalid') return plain('That branch is not part of this store.', 400)
  const window = dateWindowSchema.safeParse({ from: params.get('from') ?? '', to: params.get('to') ?? '' })
  if (!window.success) return plain(firstIssueMessage(window.error), 400)
  const { from, to } = window.data

  try {
    await verifyTenantPermission(tenantId, 'expenses', 'view')
  } catch (error) {
    if (error instanceof SubscriptionPausedError) return plain(error.message, 402)
    return plain("You don't have access to expenses.", 403)
  }

  try {
    const db = (await createClient()) as unknown as SupabaseClient
    const data = await loadExpenseExport(db, { tenantId, from, to, outletId })
    if (data.isTruncated) {
      return plain('This period has too many expenses for one file. Download a shorter period, such as one month.', 413)
    }
    const rows = buildExportRows(data.expenses, data.categories, data.suppliers, data.outlets)
    const fileName = expenseExportFileName(data.storeSlug, from, to, format)
    const disposition = `attachment; filename="${fileName}"`

    if (format === 'csv') {
      return new NextResponse(exportRowsToCsv(rows), {
        status: 200,
        headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': disposition },
      })
    }
    const { buildExpenseWorkbook } = await import('@/lib/expenses/export-workbook')
    const workbook = await buildExpenseWorkbook(rows, buildMonthlySummary(data.expenses, data.categories, data.outlets))
    return new NextResponse(workbook, {
      status: 200,
      headers: { ...NO_STORE, 'Content-Type': XLSX_TYPE, 'Content-Disposition': disposition },
    })
  } catch (error) {
    console.error('[expenses/export] failed', error instanceof Error ? error.message : error)
    return plain('We could not prepare the file. Please try again.', 500)
  }
}
