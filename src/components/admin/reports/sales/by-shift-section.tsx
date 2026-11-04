import type { ReactNode } from 'react'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readCutoffScheduleForDisplay } from '@/lib/business-day/read-schedule'
import { tradingDayWindow } from '@/lib/business-day/trading-day'
import { asCashRpcClient, type CashResult } from '@/lib/cash/cash-rpc'
import { listServicePeriods, periodsForBranch, type ServicePeriod } from '@/lib/cash/service-periods'
import { readPeriodSales, type ShiftSalesReport } from '@/lib/cash/shift-sales'
import { UNASSIGNED_BRANCH } from '@/lib/reports/period'
import { buildByShiftRows, byShiftSegments, type ByShiftRow } from '@/lib/reports/by-shift'
import { formatCount, formatMoney } from '@/lib/reports/format'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { createClient } from '@/lib/supabase/server'
import { ReportSection } from '../report-section'

const TITLE = 'By shift'
/** More named shifts than this in one day is a set-up mistake, not a day. */
const MAX_PERIODS = 8

const CLOCK = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })

function clock(iso: string): string {
  return CLOCK.format(new Date(iso)).replace(/ /g, ' ').toUpperCase()
}

function paidByText(row: ByShiftRow): string {
  if (row.payments.length === 0) return '—'
  const top = row.payments.slice(0, 3).map((payment) => `${payment.label} ${formatMoney(payment.cents)}`)
  return row.payments.length > 3 ? `${top.join(' · ')} · +${row.payments.length - 3} more` : top.join(' · ')
}

function cashSettingsHref(tenantSlug: string): string {
  return `/${encodeURIComponent(tenantSlug)}/admin/cash?tab=settings#shifts`
}

function Note({ children }: { children: ReactNode }) {
  return (
    <ReportSection title={TITLE} description="This day split into your named shifts.">
      <p className="text-[14px] leading-snug text-muted-foreground">{children}</p>
    </ReportSection>
  )
}

async function readPeriods(db: SupabaseClient, tenantId: string): Promise<ServicePeriod[] | null> {
  try {
    return await listServicePeriods(db, tenantId)
  } catch (error) {
    console.error('[reports] by shift: service periods unavailable', error instanceof Error ? error.message : error)
    return null
  }
}

function firstFailure(results: ReadonlyArray<CashResult<ShiftSalesReport>>): string | null {
  for (const result of results) if (!result.ok) return result.error.message
  return null
}

/**
 * Reports "By shift" for ONE business day (CONTRACTS §8): each named shift's
 * net, receipts and paid-by, read with `report_period_sales` (needs `reports`)
 * over windows that tile the day, plus the whole day read the same way, so
 * the owner sees the rows add up to the day. No revenue formula here.
 */
export async function ByShiftSection({ context }: { context: ReportContext }) {
  const dayKey = context.period.from
  if (context.branch.branch === UNASSIGNED_BRANCH) {
    return <Note>Shifts belong to a branch, so orders with no branch have no shifts. Pick a branch to see this day by shift.</Note>
  }

  const db = (await createClient()) as unknown as SupabaseClient
  const [{ schedule }, allPeriods] = await Promise.all([readCutoffScheduleForDisplay(db, context.tenantId), readPeriods(db, context.tenantId)])
  if (allPeriods === null) return <ReportSection title={TITLE} isError errorMessage="Your named shifts couldn’t load. Refresh the page to try again." />

  const outletId = context.branch.args.p_outlet
  const periods = periodsForBranch(allPeriods, outletId).slice(0, MAX_PERIODS)
  if (periods.length === 0) {
    const hasBranchOnly = allPeriods.length > 0 && outletId === null
    return (
      <Note>
        {hasBranchOnly ? 'Your shifts are set per branch. Pick a branch to see this day by shift.' : 'Name your shifts (like Day shift 12 PM–8 PM) to split each day by them. '}
        {!hasBranchOnly && (
          <Link href={cashSettingsHref(context.tenantSlug)} className="font-bold text-wn-ink underline underline-offset-2">
            Set up shifts
          </Link>
        )}
      </Note>
    )
  }

  const now = Date.now()
  const segments = byShiftSegments({ dayKey, schedule, periods, untilMs: now })
  if (segments.length === 0) return <Note>This business day hasn’t started yet.</Note>
  const day = tradingDayWindow(dayKey, schedule)
  const dayEndIso = new Date(Math.min(Date.parse(day.endIso), now)).toISOString()
  const client = asCashRpcClient(db)
  const window = (startIso: string, endIso: string) => ({ tenantId: context.tenantId, startIso, endIso, outletId })

  const [dayResult, ...segmentResults] = await Promise.all([
    readPeriodSales(client, window(day.startIso, dayEndIso)),
    ...segments.map((segment) => readPeriodSales(client, window(segment.startIso, segment.endIso))),
  ])
  const failed = firstFailure([dayResult, ...segmentResults])
  if (failed !== null || !dayResult.ok) return <ReportSection title={TITLE} isError errorMessage={failed ?? undefined} />

  const result = buildByShiftRows({
    segments,
    reports: segmentResults.map((entry) => (entry.ok ? entry.data : dayResult.data)),
    day: dayResult.data,
  })
  if (result.kind === 'unavailable') return <Note>Not loaded: this store’s orders are kept outside WebNegosyo’s main database.</Note>

  return (
    <ReportSection
      title={TITLE}
      description={`${clock(day.startIso)} to ${clock(day.endIso)} business day. Each shift is counted once.`}
    >
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[560px] border-collapse text-left text-[14px] tabular-nums">
          <thead>
            <tr className="border-b border-wn-line text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 sm:pl-0">Shift</th>
              <th scope="col" className="px-3 py-2.5 text-right">Receipts</th>
              <th scope="col" className="px-3 py-2.5">Paid by</th>
              <th scope="col" className="px-4 py-2.5 text-right sm:pr-0">Net sales</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.key} className="border-b border-wn-line">
                <td className="px-4 py-3 sm:pl-0">
                  <span className="block font-bold text-wn-ink">{row.label}</span>
                  <span className="block text-[12.5px] text-muted-foreground">
                    {row.startIso && row.endIso ? `${clock(row.startIso)} – ${clock(row.endIso)}` : 'Outside your named shifts'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-wn-ink">{formatCount(row.orders)}</td>
                <td className="px-3 py-3 text-[13px] text-muted-foreground">{paidByText(row)}</td>
                <td className="px-4 py-3 text-right font-bold text-wn-ink sm:pr-0">{formatMoney(row.netCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="px-4 pt-3 text-left text-[13.5px] font-bold text-wn-ink sm:pl-0">
                {result.addsUp ? 'Adds up to the day’s net sales' : `The day’s net sales are ${formatMoney(result.dayNetCents)}`}
              </th>
              <td className="px-4 pt-3 text-right text-[15px] font-extrabold text-wn-ink sm:pr-0">{formatMoney(result.totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!result.addsUp && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">
          An order changed while this loaded, so the shifts and the day differ. Refresh to read them again.
        </p>
      )}
    </ReportSection>
  )
}
