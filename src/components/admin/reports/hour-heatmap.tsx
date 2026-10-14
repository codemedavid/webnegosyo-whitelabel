'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCount, formatMoney } from '@/lib/reports/format'
import { ChartViewToggle } from './chart-view-toggle'
import { HEAT_STEPS } from './report-colors'
import { ReportTable, type ReportColumn } from './report-table'

export interface HourCell {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number
  /** 0..23, store-local. */
  hour: number
  orders: number
  netCents: number
}

export interface HourHeatmapProps {
  cells: HourCell[]
  /** Which figure sets the shade. Both are in every cell's label. */
  metric: 'orders' | 'net'
  /** Optional screen-reader sentence: "Busiest: Saturday 7 PM." */
  summary?: string
  className?: string
}

const WEEKDAYS = [
  { iso: 1, short: 'Mon', long: 'Monday' },
  { iso: 2, short: 'Tue', long: 'Tuesday' },
  { iso: 3, short: 'Wed', long: 'Wednesday' },
  { iso: 4, short: 'Thu', long: 'Thursday' },
  { iso: 5, short: 'Fri', long: 'Friday' },
  { iso: 6, short: 'Sat', long: 'Saturday' },
  { iso: 7, short: 'Sun', long: 'Sunday' },
] as const
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
/** Hour labels shown every N hours where columns are narrow (≥640px). */
const LABEL_EVERY = 3

export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${hour % 12 || 12} ${suffix}`
}

function shortHourLabel(hour: number): string {
  return `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`
}

export function heatCellLabel(weekday: number, hour: number, orders: number, netCents: number): string {
  const day = WEEKDAYS.find((entry) => entry.iso === weekday)?.long ?? `Day ${weekday}`
  const orderWord = orders === 1 ? 'order' : 'orders'
  return `${day} ${hourLabel(hour)}: ${formatCount(orders)} ${orderWord}, ${formatMoney(netCents)}`
}

/** 0 = nothing; 1..5 = quintiles of the busiest cell. */
export function heatStep(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.max(1, Math.min(HEAT_STEPS.length - 1, Math.ceil((value / max) * (HEAT_STEPS.length - 1))))
}

const keyOf = (weekday: number, hour: number) => `${weekday}-${hour}`

const TABLE_COLUMNS: ReportColumn<HourCell>[] = [
  {
    key: 'when',
    header: 'Day and hour',
    render: (cell) => `${WEEKDAYS[cell.weekday - 1]?.long ?? cell.weekday} ${hourLabel(cell.hour)}`,
  },
  { key: 'orders', header: 'Orders', isNumeric: true, render: (cell) => formatCount(cell.orders) },
  { key: 'net', header: 'Net sales', isNumeric: true, render: (cell) => formatMoney(cell.netCents) },
]

/**
 * Weekday × hour. One DOM order serves both layouts: groups of [hour label,
 * Mon..Sun]. A phone flows them as ROWS (24 hours down, 7 days across, no
 * sideways scroll); from 640px `grid-flow-col` turns each group into a COLUMN
 * (7 days down, 24 hours across). Every cell carries its full label.
 */
export function HourHeatmap({ cells, metric, summary, className }: HourHeatmapProps) {
  const [isTable, setIsTable] = useState(false)
  const byKey = new Map(cells.map((cell) => [keyOf(cell.weekday, cell.hour), cell]))
  const valueOf = (cell: HourCell | undefined) => (metric === 'orders' ? (cell?.orders ?? 0) : (cell?.netCents ?? 0))
  const max = cells.reduce((best, cell) => Math.max(best, valueOf(cell)), 0)
  const metricName = metric === 'orders' ? 'orders' : 'net sales'
  const tableRows = cells
    .filter((cell) => cell.orders > 0 || cell.netCents !== 0)
    .sort((a, b) => a.weekday - b.weekday || a.hour - b.hour)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {summary && <p className="sr-only">{summary}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isTable ? <span /> : <HeatLegend metricName={metricName} />}
        <ChartViewToggle
          isTable={isTable}
          onToggle={() => setIsTable((value) => !value)}
          subject={`${metricName} by hour`}
        />
      </div>
      {isTable ? (
        <ReportTable
          caption="Orders and net sales by day and hour"
          columns={TABLE_COLUMNS}
          rows={tableRows}
          rowKey={(cell) => keyOf(cell.weekday, cell.hour)}
          emptyMessage="No orders in this period."
        />
      ) : (
        <div
          role="group"
          aria-label={`Shade shows ${metricName} by day and hour`}
          className={cn(
            'grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] gap-[3px]',
            'sm:grid-flow-col sm:grid-cols-[2.5rem] sm:auto-cols-fr sm:grid-rows-[auto_repeat(7,minmax(0,1fr))]',
          )}
        >
          <span aria-hidden />
          {WEEKDAYS.map((day) => (
            <span
              key={day.iso}
              aria-hidden
              className="flex items-center justify-center text-[11px] font-semibold text-wn-stone sm:justify-start"
            >
              {day.short}
            </span>
          ))}
          {HOURS.flatMap((hour) => [
            <span
              key={`h${hour}`}
              aria-hidden
              className={cn(
                'flex items-center text-[11px] text-wn-stone tabular-nums sm:justify-center sm:pb-0.5',
                hour % LABEL_EVERY !== 0 && 'sm:invisible',
              )}
            >
              {shortHourLabel(hour)}
            </span>,
            ...WEEKDAYS.map((day) => {
              const cell = byKey.get(keyOf(day.iso, hour))
              const step = heatStep(valueOf(cell), max)
              const label = heatCellLabel(day.iso, hour, cell?.orders ?? 0, cell?.netCents ?? 0)
              return (
                <span
                  key={keyOf(day.iso, hour)}
                  role="img"
                  aria-label={label}
                  title={label}
                  data-step={step}
                  className="h-6 rounded-[4px]"
                  style={{ backgroundColor: HEAT_STEPS[step] }}
                />
              )
            }),
          ])}
        </div>
      )}
    </div>
  )
}

function HeatLegend({ metricName }: { metricName: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-wn-stone">
      <span>Fewer {metricName}</span>
      <span aria-hidden className="flex gap-[2px]">
        {HEAT_STEPS.map((color) => (
          <span key={color} className="size-3 rounded-[2px] ring-1 ring-black/5" style={{ backgroundColor: color }} />
        ))}
      </span>
      <span>More</span>
    </div>
  )
}
