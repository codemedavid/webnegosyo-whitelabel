'use client'

import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { formatCompact, formatCurrency, formatCurrencyCompact, formatNumber } from '@/components/superadmin/ui/format'

/* =============================================================================
   Black-themed chart primitives for the superadmin analytics surfaces.
   Wrap recharts with the `/download` palette so every chart renders on pure
   black with white/opacity strokes and a glassy tooltip.
   ========================================================================== */

/** Categorical palette that reads on pure black (white-led, then accents). */
export const CHART_COLORS = [
  '#ffffff',
  '#a1a1aa', // zinc-400
  '#818cf8', // indigo-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
  '#38bdf8', // sky-400
  '#c084fc', // purple-400
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DarkTooltip({ active, payload, label, valueKind }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/15 bg-black/90 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      {label != null && <p className="mb-1 font-medium text-white">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-white/70">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color || entry.payload?.fill }} />
          <span className="capitalize">{entry.name}:</span>
          <span className="font-semibold text-white">
            {valueKind === 'currency' ? formatCurrency(entry.value) : formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export interface TrendDatum {
  label: string
  orders: number
  revenue: number
}

/** Smooth gradient area chart for a time series (revenue or orders). */
export function TrendAreaChart({
  data,
  metric,
  height = 260,
  className,
}: {
  data: TrendDatum[]
  metric: 'revenue' | 'orders'
  height?: number
  className?: string
}) {
  const gid = useId().replace(/:/g, '')
  const isCurrency = metric === 'revenue'

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => (isCurrency ? formatCurrencyCompact(v) : formatCompact(v))}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
            content={<DarkTooltip valueKind={isCurrency ? 'currency' : 'number'} />}
          />
          <Area
            type="monotone"
            dataKey={metric}
            name={isCurrency ? 'Revenue' : 'Orders'}
            stroke="#ffffff"
            strokeWidth={2}
            fill={`url(#grad-${gid})`}
            dot={false}
            activeDot={{ r: 4, fill: '#fff', stroke: '#000', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface DonutDatum {
  label: string
  count: number
}

/** Donut with a center total and an inline legend showing per-slice share. */
export function DonutChart({
  data,
  height = 200,
  centerLabel = 'Total',
  valueKind = 'number',
  className,
}: {
  data: DonutDatum[]
  height?: number
  centerLabel?: string
  valueKind?: 'number' | 'currency'
  className?: string
}) {
  const total = data.reduce((s, d) => s + d.count, 0)

  if (total === 0) {
    return (
      <div className={cn('flex items-center justify-center text-sm text-white/40', className)} style={{ height }}>
        No data in this period
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center gap-5 sm:flex-row', className)}>
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<DarkTooltip valueKind={valueKind} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tracking-tight text-white">{formatCompact(total)}</span>
          <span className="text-[10px] uppercase tracking-wide text-white/45">{centerLabel}</span>
        </div>
      </div>

      <ul className="flex-1 space-y-2 self-stretch">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-white/70">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              <span className="font-semibold text-white">{formatNumber(d.count)}</span>
              <span className="w-10 text-right text-xs text-white/40">{Math.round((d.count / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface BarListDatum {
  label: string
  value: number
  /** optional secondary metric shown muted on the right */
  sub?: string
}

/** Lightweight horizontal bar-list (no recharts) for ranked category breakdowns. */
export function BarList({
  data,
  valueKind = 'number',
  className,
}: {
  data: BarListDatum[]
  valueKind?: 'number' | 'currency'
  className?: string
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1
  return (
    <div className={cn('space-y-2.5', className)}>
      {data.map((d, i) => (
        <div key={d.label} className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <div
            className="absolute inset-y-0 left-0 rounded-lg bg-white/[0.06]"
            style={{ width: `${Math.max(3, (d.value / max) * 100)}%` }}
          />
          <div className="relative flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="w-4 shrink-0 text-right text-xs text-white/35 tabular-nums">{i + 1}</span>
              <span className="truncate text-white/80">{d.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 tabular-nums">
              {d.sub ? <span className="text-xs text-white/40">{d.sub}</span> : null}
              <span className="font-semibold text-white">
                {valueKind === 'currency' ? formatCurrency(d.value) : formatNumber(d.value)}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
