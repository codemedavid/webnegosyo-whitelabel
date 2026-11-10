import { NextRequest, NextResponse } from 'next/server'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { toContextPayload } from '@/lib/reports/api/context-payload'
import { reportQuerySchema, toReportSearchRecord } from '@/lib/reports/api/query-schema'
import { runReportQuery } from '@/lib/reports/api/run-report-query'
import { loadReportRequest, reportClient } from '@/lib/reports/read/load-report-context'
import { visibleMetrics } from '@/lib/reports/metrics/registry'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
/** A report screen sends a few requests per filter change; a script sends far more. */
const RATE_LIMIT = { limit: 60, windowSec: 60 } as const

const REFUSAL_MESSAGES: Readonly<Record<string, string>> = {
  no_account: 'Sign in again to see reports.',
  other_store: 'This account belongs to another store.',
  no_permission: 'You need the Reports permission to see this. Ask the store owner.',
  platform_staff: 'Platform staff accounts cannot open store reports.',
}

function fail(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ success: false, error, ...extra }, { status, headers: { ...NO_STORE, ...headers } })
}

/**
 * POST /api/reports/query — the report engine for the merchant app (Bearer)
 * and any web client (cookie): one screen's sections for one period, every
 * figure from the one sales definition (`src/lib/reports/`). Plan
 * docs/plans/2026-11-05-reports-redesign §5.4.
 *
 * Reads run as the CALLER (`withRequestBearer` + the session client), so RLS
 * and the `reports` / `costs` keys decide what comes back; a branch-locked
 * account always reads its own branch whatever the body says.
 */
export function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleQuery(request))
}

async function handleQuery(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = reportQuerySchema.safeParse(body)
  if (!parsed.success) return fail(400, 'That report request is not valid.')
  const query = parsed.data

  const { user } = await getRequestCaller()
  if (!user) return fail(401, 'Sign in again to see reports.')
  const verdict = await checkRateLimit(`reports:query:${user.id}`, RATE_LIMIT)
  if (!verdict.allowed) {
    return fail(429, 'Too many report requests. Give it a moment.', {}, { 'Retry-After': String(verdict.retryAfterSec) })
  }

  try {
    const { page, canSeeCosts } = await loadReportRequest(query.tenantId, toReportSearchRecord(query))
    if (page.kind === 'not_found') return fail(404, 'Store not found.')
    if (page.kind === 'refused') return fail(403, REFUSAL_MESSAGES[page.reason] ?? REFUSAL_MESSAGES.no_permission, { reason: page.reason })
    if (page.kind === 'unsupported') {
      return fail(409, 'These reports are for stores on the WebNegosyo database.', { backend: page.backend })
    }

    const sections = await runReportQuery({
      context: page.context,
      client: await reportClient(),
      sections: query.sections,
      grain: query.grain,
      canSeeCosts,
    })
    return NextResponse.json(
      { success: true, context: toContextPayload(page.context), metrics: visibleMetrics(canSeeCosts), sections },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('[reports/query] failed', error instanceof Error ? error.message : error)
    return fail(500, 'The report could not load. Try again in a moment.')
  }
}
