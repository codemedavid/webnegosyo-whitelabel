'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { HourRow } from '@/lib/dashboard/overview'
import { ChartEmptyState } from './chart-empty-state'
import { SERIES_CURRENT, formatCount, formatPeso } from './dashboard-format'

/** Warm grey that still clears 3:1 on white; the busiest hour alone takes coral. */
const QUIET_BAR = '#A39C90'

interface PeakHoursChartProps {
  hours: HourRow[]
  busiestHour: number | null
}

function HourTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: HourRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  return (
    <div className="rounded-xl bg-wn-ink px-3.5 py-2.5 text-xs text-white shadow-lg">
      <p className="font-bold">{row.label}</p>
      <p className="mt-0.5 text-white/65 tabular-nums">
        {formatCount(row.orders)} orders · {formatPeso(row.sales)}
      </p>
    </div>
  )
}

/** Orders by hour of day — when the rush actually happens. */
export function PeakHoursChart({ hours, busiestHour }: PeakHoursChartProps) {
  if (!hours.some((row) => row.orders > 0)) {
    return (
      <ChartEmptyState
        className="h-44"
        title="No completed orders in this period yet"
        hint="Your rush hours show up here once orders are paid or delivered."
      />
    )
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={hours} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={5}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={<HourTooltip />} />
          <Bar
            dataKey="orders"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            shape={(props: unknown) => {
              const { x, y, width, height, payload } = props as {
                x: number
                y: number
                width: number
                height: number
                payload: HourRow
              }
              const isPeak = payload.hour === busiestHour
              return (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx={3}
                  fill={isPeak ? SERIES_CURRENT : QUIET_BAR}
                />
              )
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
