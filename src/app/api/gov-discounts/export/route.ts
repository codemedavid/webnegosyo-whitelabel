import { NextRequest, NextResponse } from 'next/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import { createClient } from '@/lib/supabase/server'
import { loadLedgerWindow } from '@/lib/gov-discount-reports/load-ledger'
import { resolveReportPeriod } from '@/lib/gov-discount-reports/period'
import { bookFileName, buildExportCsv, isExportBook } from '@/lib/gov-discount-reports/sales-book'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function plain(message: string, status: number): NextResponse {
  return new NextResponse(message, { status, headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' } })
}

/**
 * GET /api/gov-discounts/export?tenantId=…&book=senior|pwd|athlete|medal_of_valor|summary&period=…[&from&to]
 *
 * The BIR supporting records as CSV. Read with the CALLER's cookie session,
 * so RLS decides what is in the file exactly as it decides what the page
 * shows (a branch-locked reviewer exports their branch). Full ID numbers:
 * this is the record BIR asks for. An incomplete read is refused rather than
 * handed over as if it were the whole month.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const tenantId = params.get('tenantId') ?? ''
  const book = params.get('book')
  if (!UUID_RE.test(tenantId)) return plain('A valid store is required.', 400)
  if (!isExportBook(book)) return plain('Choose which book to download.', 400)

  try {
    await verifyTenantPermission(tenantId, 'discount_review', 'view')
  } catch (error) {
    if (error instanceof SubscriptionPausedError) return plain(error.message, 402)
    return plain('Only owners and managers can download the Senior/PWD sales book.', 403)
  }

  const period = resolveReportPeriod(
    { period: params.get('period'), from: params.get('from'), to: params.get('to') },
    Date.now(),
  )

  try {
    const supabase = await createClient()
    const { rows, isTruncated } = await loadLedgerWindow(supabase, tenantId, period)
    if (isTruncated) {
      return plain('This period has too many records for one file. Download a shorter period, such as one month.', 413)
    }
    return new NextResponse(buildExportCsv(book, rows), {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${bookFileName(book, period)}"`,
      },
    })
  } catch (error) {
    console.error('[gov-discounts/export] failed', error instanceof Error ? error.message : error)
    return plain('We could not prepare the file. Please try again.', 500)
  }
}
