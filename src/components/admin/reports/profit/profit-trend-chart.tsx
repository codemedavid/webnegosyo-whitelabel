'use client'

import { useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney, formatMoneyAxis } from '@/lib/reports/format'
import { ChartViewToggle } from '../chart-view-toggle'
import { ReportTable, type ReportColumn } from '../report-table'

export interface ProfitTrendBucket {
  key: string
  /** Axis label: "Oct 7", "Week of Oct 5". */
  label: string
  netSalesCents: number
  profitCents: number
  /** The bucket still running ("so far"): drawn hollow. */
  isIncomplete: boolean
}

export interface ProfitTrendChartProps {
  buckets: ProfitTrendBucket[]
  /** One sentence for screen readers. */
  summary: string
}

const INK = '#1D1815'
const PROFIT = '#065F46'
const LOSS = '#B91C1C'

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ProfitTrendBucket }> }) {
  const bucket = active ? payload?.[0]?.payload : undefined
  if (!bucket) return null
  return (
    <div className="rounded-xl bg-wn-ink px-3.5 py-2.5 text-xs text-white shadow-lg">
      <p className="font-bold">
        {bucket.label}
        {bucket.isIncomplete && ' (so far)'}
      </p>
      <p className="mt-0.5 tabular-nums">Sales: {formatMoney(bucket.netSalesCents)}</p>
      <p className="tabular-nums">
        {bucket.profitCents < 0 ? 'Loss' : 'Profit'}: {formatMoney(bucket.profitCents)}
      </p>
    </div>
  )
}

const COLUMNS: ReportColumn<ProfitTrendBucket>[] = [
  { key: 'label', header: 'Period', render: (bucket) => `${bucket.label}${bucket.isIncomplete ? ' (so far)' : ''}` },
  { key: 'sales', header: 'Sales', isNumeric: true, render: (bucket) => formatMoney(bucket.netSalesCents) },
  { key: 'profit', header: 'Profit', isNumeric: true, render: (bucket) => formatMoney(bucket.profitCents) },
]

function Legend() {
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-wn-stone">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t-2" style={{ borderColor: INK }} />
        Sales
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: PROFIT }} />
        Profit
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px] border-2" style={{ borderColor: PROFIT }} />
        So far
      </span>
    </div>
  )
}

/** Sales as a line, profit as bars; the running period hollow. No animation (plan §4 motion). */
export function ProfitTrendChart({ buckets, summary }: ProfitTrendChartProps) {
  const [isTable, setIsTable] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only">{summary}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isTable ? <span /> : <Legend />}
        <ChartViewToggle isTable={isTable} onToggle={() => setIsTable((value) => !value)} subject="profit trend" />
      </div>
      {isTable ? (
        <ReportTable
          caption="Sales and profit by period"
          columns={COLUMNS}
          rows={buckets}
          rowKey={(bucket) => bucket.key}
          emptyMessage="Nothing to show for this period."
        />
      ) : (
        <div aria-hidden data-testid="profit-trend-canvas" className="h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={buckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%" accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke="#E5E0D6" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} tick={{ fontSize: 11, fill: '#6B655B' }} />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatMoneyAxis(value)}
                tick={{ fontSize: 11, fill: '#6B655B' }}
              />
              <ReferenceLine y={0} stroke="#A39C90" />
              <Tooltip cursor={{ fill: '#F7F5F0' }} content={<TrendTooltip />} />
              <Bar dataKey="profitCents" radius={[4, 4, 0, 0]} isAnimationActive={false} strokeWidth={2}>
                {buckets.map((bucket) => {
                  const color = bucket.profitCents < 0 ? LOSS : PROFIT
                  return <Cell key={bucket.key} fill={bucket.isIncomplete ? '#FFFFFF' : color} stroke={color} />
                })}
              </Bar>
              <Line
                dataKey="netSalesCents"
                type="linear"
                stroke={INK}
                strokeWidth={2}
                dot={{ r: 2.5, fill: INK, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
