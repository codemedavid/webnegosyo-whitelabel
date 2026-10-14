import { busiestHours, slotLabel } from '@/lib/reports/breakdown-view'
import { formatCount, formatMoney } from '@/lib/reports/format'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { reportClient } from '@/lib/reports/read/load-report-context'
import { readHours } from '@/lib/reports/read/report-rpc'
// Only the component crosses the client boundary: a helper exported from a
// 'use client' file throws when a Server Component calls it.
import { HourHeatmap } from '../../hour-heatmap'
import { ReportSection } from '../../report-section'

const BUSIEST_SHOWN = 5

export async function HoursBreakdown({ context }: { context: ReportContext }) {
  const client = await reportClient()
  const hours = await readHours(client, context.windows.current)
  const busiest = hours.ok ? busiestHours(hours.data, BUSIEST_SHOWN) : []
  const summary = busiest[0] ? `Busiest: ${slotLabel(busiest[0].weekday, busiest[0].hour)}.` : 'No orders in this period.'

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <ReportSection
        title="Orders by day and hour"
        description="Darker means more orders. Philippine time."
        isError={!hours.ok}
        errorMessage={hours.ok ? undefined : hours.error.message}
        className="lg:col-span-2"
      >
        {hours.ok && <HourHeatmap cells={hours.data} metric="orders" summary={summary} />}
      </ReportSection>
      <ReportSection title="Busiest hours" description="Plan staff and prep around these." isError={!hours.ok} errorMessage={hours.ok ? undefined : hours.error.message}>
        {hours.ok &&
          (busiest.length === 0 ? (
            <p className="text-[13.5px] text-muted-foreground">No orders in this period.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-wn-line">
              {busiest.map((cell) => (
                <li key={`${cell.weekday}-${cell.hour}`} className="flex items-baseline justify-between gap-3 py-2.5 text-[13.5px]">
                  <span className="font-semibold text-wn-ink">{slotLabel(cell.weekday, cell.hour)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCount(cell.orders)} {cell.orders === 1 ? 'order' : 'orders'} · {formatMoney(cell.netCents)}
                  </span>
                </li>
              ))}
            </ol>
          ))}
      </ReportSection>
    </div>
  )
}
