'use client'

import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { formatMoney, formatMoneyAxis } from '@/lib/reports/format'
import { ChartViewToggle } from './chart-view-toggle'
import { SERIES_COMPARE, SERIES_CURRENT } from './report-colors'
import { ReportTable, type ReportColumn } from './report-table'

export interface TrendBucket {
  key: string
  /** Axis label: "Mon", "Oct 7", "7 PM". */
  label: string
  currentCents: number
  /** `null` = no comparison for this bucket (the line breaks there). */
  previousCents: number | null
}

export interface TrendChartProps {
  buckets: TrendBucket[]
  /** "Net sales". */
  seriesLabel: string
  /** "Last week". Omit to hide the comparison line. */
  compareLabel?: string
  /** One sentence for screen readers describing what the chart shows. */
  summary: string
  className?: string
}

interface TooltipPayload {
  payload?: TrendBucket
}

function TrendTooltip({
  active,
  payload,
  seriesLabel,
  compareLabel,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  seriesLabel: string
  compareLabel?: string
}) {
  const bucket = active ? payload?.[0]?.payload : undefined
  if (!bucket) return null
  return (
    <div className="rounded-xl bg-wn-ink px-3.5 py-2.5 text-xs text-white shadow-lg">
      <p className="font-bold">{bucket.label}</p>
      <p className="mt-0.5 tabular-nums">
        {seriesLabel}: {formatMoney(bucket.currentCents)}
      </p>
      {compareLabel && (
        <p className="text-white/70 tabular-nums">
          {compareLabel}: {formatMoney(bucket.previousCents)}
        </p>
      )}
    </div>
  )
}

function Legend({ seriesLabel, compareLabel }: { seriesLabel: string; compareLabel?: string }) {
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-wn-stone">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: SERIES_CURRENT }} />
        {seriesLabel}
      </span>
      {compareLabel && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: SERIES_COMPARE }} />
          {compareLabel}
        </span>
      )}
    </div>
  )
}

function trendColumns(seriesLabel: string, compareLabel?: string): ReportColumn<TrendBucket>[] {
  const columns: ReportColumn<TrendBucket>[] = [
    { key: 'label', header: 'Period', render: (bucket) => bucket.label },
    { key: 'current', header: seriesLabel, isNumeric: true, render: (bucket) => formatMoney(bucket.currentCents) },
  ]
  if (!compareLabel) return columns
  return [
    ...columns,
    { key: 'previous', header: compareLabel, isNumeric: true, render: (bucket) => formatMoney(bucket.previousCents) },
  ]
}

/**
 * Columns for this period with a dashed line for the comparison. No count-up
 * or draw-in animation (plan §4 motion), which also covers reduced motion.
 */
export function TrendChart({ buckets, seriesLabel, compareLabel, summary, className }: TrendChartProps) {
  const [isTable, setIsTable] = useState(false)
  const hasCompare = Boolean(compareLabel) && buckets.some((bucket) => bucket.previousCents !== null)
  const lineLabel = hasCompare ? compareLabel : undefined

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="sr-only">{summary}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isTable ? <span /> : <Legend seriesLabel={seriesLabel} compareLabel={lineLabel} />}
        <ChartViewToggle
          isTable={isTable}
          onToggle={() => setIsTable((value) => !value)}
          subject={seriesLabel.toLowerCase()}
        />
      </div>
      {isTable ? (
        <ReportTable
          caption={`${seriesLabel} by period`}
          columns={trendColumns(seriesLabel, lineLabel)}
          rows={buckets}
          rowKey={(bucket) => bucket.key}
          emptyMessage="Nothing to show for this period."
        />
      ) : (
        <div aria-hidden data-testid="trend-chart-canvas" className="h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={buckets}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              barCategoryGap="22%"
              accessibilityLayer={false}
            >
              <CartesianGrid vertical={false} stroke="#E5E0D6" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={12}
                tick={{ fontSize: 11, fill: '#6B655B' }}
              />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatMoneyAxis(value)}
                tick={{ fontSize: 11, fill: '#6B655B' }}
              />
              <Tooltip
                cursor={{ fill: '#F7F5F0' }}
                content={<TrendTooltip seriesLabel={seriesLabel} compareLabel={lineLabel} />}
              />
              <Bar dataKey="currentCents" fill={SERIES_CURRENT} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              {lineLabel && (
                <Line
                  dataKey="previousCents"
                  // Straight segments with a dot per bucket: a smoothed curve
                  // reads as values between days that never existed.
                  type="linear"
                  stroke={SERIES_COMPARE}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 2.5, fill: SERIES_COMPARE, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
