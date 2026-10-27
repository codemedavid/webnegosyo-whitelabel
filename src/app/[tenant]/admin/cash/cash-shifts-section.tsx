import type { SupabaseClient } from '@supabase/supabase-js'
import { asCashRpcClient, type CashResult } from '@/lib/cash/cash-rpc'
import type { CashPageContext } from '@/lib/cash/cash-page'
import { listRemittances, REMITTANCE_STATUSES, type Remittance } from '@/lib/cash/remittances'
import { listServicePeriods, type ServicePeriod } from '@/lib/cash/service-periods'
import { readCountAttempts } from '@/lib/cash/shift-counts'
import { readShiftSales, type ShiftSalesReport } from '@/lib/cash/shift-sales'
import { readShiftsForDay, summarizeCashShifts, type CashShift } from '@/lib/cash/shifts-read'
import { createClient } from '@/lib/supabase/server'
import { KpiTile } from '@/components/admin/reports/kpi-tile'
import { dayLabel, formatMoney, netDifferenceLabel } from '@/components/admin/cash/cash-format'
import { CashLoadFailed, CashNotice } from '@/components/admin/cash/cash-states'
import { buildShiftRows, shiftSalesTotal } from '@/components/admin/cash/shifts-model'
import { ShiftsTable } from '@/components/admin/cash/shifts-table'

/** A day's table reads each shift's sales; beyond this many the row says "Open to see". */
const MAX_SALES_LOOKUPS = 40
/** Parallel report calls per page: every store shares one database. */
const SALES_CONCURRENCY = 4

async function readSalesFor(db: SupabaseClient, shifts: readonly CashShift[]): Promise<Map<string, CashResult<ShiftSalesReport>>> {
  const client = asCashRpcClient(db)
  const queue = shifts.slice(0, MAX_SALES_LOOKUPS)
  const results = new Map<string, CashResult<ShiftSalesReport>>()
  let next = 0
  async function worker(): Promise<void> {
    while (next < queue.length) {
      const shift = queue[next]
      next += 1
      results.set(shift.id, await readShiftSales(client, shift.id))
    }
  }
  await Promise.all(Array.from({ length: Math.min(SALES_CONCURRENCY, queue.length) }, worker))
  return results
}

async function readPeriodsOrEmpty(db: SupabaseClient, tenantId: string): Promise<ServicePeriod[]> {
  try {
    return await listServicePeriods(db, tenantId)
  } catch (error) {
    // Advisory: the table still opens, rows just don't name their shift.
    console.error('[cash] service periods unavailable', error instanceof Error ? error.message : error)
    return []
  }
}

/** The day's end-of-shift remittances by shift. Advisory: the table opens without them. */
async function readShiftRemittances(db: SupabaseClient, context: CashPageContext): Promise<Map<string, Remittance>> {
  try {
    const list = await listRemittances(db, {
      tenantId: context.tenantId,
      statuses: REMITTANCE_STATUSES,
      businessDay: context.day,
      outletId: context.outletId,
    })
    return new Map(list.filter((row) => row.kind === 'shift' && row.shiftId).map((row) => [row.shiftId as string, row]))
  } catch (error) {
    console.error('[cash] remittances unavailable', error instanceof Error ? error.message : error)
    return new Map()
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** The Shifts tab: four figures, then every shift of the business day. */
export async function CashShiftsSection({ context, isPlatformBackend }: { context: CashPageContext; isPlatformBackend: boolean }) {
  const db = (await createClient()) as unknown as SupabaseClient
  let shifts: CashShift[]
  try {
    shifts = await readShiftsForDay(db, { tenantId: context.tenantId, day: context.day, outletId: context.outletId })
  } catch (error) {
    console.error('[cash] shifts unavailable', { tenantId: context.tenantId, error: error instanceof Error ? error.message : String(error) })
    return <CashLoadFailed />
  }

  if (shifts.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-border">
        <p className="text-[17px] font-extrabold text-wn-ink">No shifts on {dayLabel(context.day)}.</p>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-wn-stone text-pretty">
          Cashiers start a shift in the app’s Drawer. Each one shows here with its sales and what was counted.
        </p>
      </div>
    )
  }

  const [periods, sales, remittances, countAttempts] = await Promise.all([
    readPeriodsOrEmpty(db, context.tenantId),
    readSalesFor(db, shifts),
    readShiftRemittances(db, context),
    readCountAttempts(db, shifts.map((shift) => shift.id)),
  ])
  const rows = buildShiftRows(shifts, {
    sales,
    periodNames: new Map(periods.map((period) => [period.id, period.name])),
    remittances,
    countAttempts,
  })
  const summary = summarizeCashShifts(shifts)
  const total = shiftSalesTotal(rows)
  const loadedCount = rows.filter((row) => row.sales.kind === 'ready').length

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Net sales on these shifts"
          valueCents={total.netCents}
          hint={total.isComplete ? plural(rows.length, 'shift', 'shifts') : `${loadedCount} of ${rows.length} shifts added up`}
        />
        <KpiTile label="Shifts" value={String(summary.count)} hint={summary.openCount > 0 ? `${summary.openCount} still open` : 'All ended'} />
        <KpiTile
          label="Cash counted"
          valueCents={summary.countedCount > 0 ? summary.countedCents : null}
          hint={summary.countedCount > 0 ? plural(summary.countedCount, 'drawer counted', 'drawers counted') : 'Nothing counted yet'}
        />
        <KpiTile
          label="Short / over"
          value={summary.countedCount > 0 ? netDifferenceLabel(summary.netDifferenceCents) : null}
          hint={
            summary.countedCount > 0
              ? `${summary.shortCount} short · ${summary.overCount} over · ${summary.exactCount} exact`
              : 'Shows once a drawer is counted'
          }
        />
      </div>
      {!isPlatformBackend && (
        <CashNotice>
          Sales per shift show in the app’s Drawer for this store: its orders are kept outside WebNegosyo’s main database. Counts and
          results below are complete.
        </CashNotice>
      )}
      {shifts.length > MAX_SALES_LOOKUPS && (
        <CashNotice>
          The first {MAX_SALES_LOOKUPS} shifts are added up here. Open any other shift to see its sales.
        </CashNotice>
      )}
      <ShiftsTable rows={rows} outletNames={context.outletNames} showBranch={context.branchOptions !== null && context.outletId === null} />
      {summary.netDifferenceCents !== null && summary.netDifferenceCents !== 0 && (
        <p className="text-[13px] text-wn-stone tabular-nums">
          Net difference across counted drawers: {formatMoney(summary.netDifferenceCents, { centavos: true })}. Shortages are recorded here,
          never taken from anyone’s pay.
        </p>
      )}
    </>
  )
}
