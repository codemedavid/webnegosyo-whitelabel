'use client'

import { useState } from 'react'
import { PhilippinePeso, Receipt, Repeat2, ShoppingBag, UserPlus, type LucideIcon } from 'lucide-react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { ChangePill } from './change-pill'
import { ChartEmptyState } from './chart-empty-state'
import { SERIES_PREVIOUS, formatCount, formatPeso, formatPesoCompact } from './dashboard-format'
import type { MetricKey, MetricTile } from './dashboard-metrics'
import { METRIC_STYLES } from './metric-style'

const ICONS: Readonly<Record<MetricKey, LucideIcon>> = {
  newCustomers: UserPlus,
  returningCustomers: Repeat2,
  sales: PhilippinePeso,
  orders: ShoppingBag,
  avgOrder: Receipt,
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatValue(tile: Pick<MetricTile, 'kind'>, value: number): string {
  return tile.kind === 'money' ? formatPeso(value) : formatCount(value)
}

interface MetricsPanelProps {
  tiles: MetricTile[]
  labels: string[]
  compareLabel: string
}

/**
 * Key metrics as tappable tiles over one chart (TikTok Studio style): the
 * chart follows the chosen tile, this period against the one before.
 */
export function MetricsPanel({ tiles, labels, compareLabel }: MetricsPanelProps) {
  const [selectedKey, setSelectedKey] = useState<MetricKey>(tiles[0]?.key ?? 'sales')
  const selected = tiles.find((tile) => tile.key === selectedKey) ?? tiles[0]
  if (!selected) return null

  return (
    <section aria-label="Key metrics" className="overflow-hidden rounded-2xl bg-white ring-1 ring-border">
      <div
        className={cn(
          'grid grid-cols-2 gap-2 p-2',
          tiles.length >= 4 ? 'lg:grid-cols-4' : tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
        )}
      >
        {tiles.map((tile) => (
          <MetricTileButton
            key={tile.key}
            tile={tile}
            isSelected={tile.key === selected.key}
            onSelect={() => setSelectedKey(tile.key)}
          />
        ))}
      </div>
      <div className="border-t border-wn-line px-2 pb-4 pt-4 sm:px-5">
        <MetricChart tile={selected} labels={labels} compareLabel={compareLabel} />
      </div>
    </section>
  )
}

interface MetricTileButtonProps {
  tile: MetricTile
  isSelected: boolean
  onSelect: () => void
}

function MetricTileButton({ tile, isSelected, onSelect }: MetricTileButtonProps) {
  const Icon = ICONS[tile.key]
  const style = METRIC_STYLES[tile.key]
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-xl p-3.5 text-left outline-none transition-colors duration-150 sm:p-4',
        'focus-visible:ring-2 focus-visible:ring-ring/40',
        isSelected ? 'bg-wn-sand ring-1 ring-wn-line' : 'hover:bg-wn-sand/60',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: style.wash, color: style.ink }}
          aria-hidden
        >
          <Icon className="h-[17px] w-[17px]" />
        </span>
        <span className="min-w-0 text-[13px] font-bold leading-tight text-muted-foreground">{tile.label}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[24px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-foreground sm:text-[28px]">
          {formatValue(tile, tile.value)}
        </span>
        <ChangePill change={tile.change} />
      </span>
      {isSelected && (
        <span aria-hidden className="absolute inset-x-4 bottom-0 h-[3px] rounded-full" style={{ backgroundColor: style.color }} />
      )}
    </button>
  )
}

interface ChartRow {
  label: string
  current: number | null
  previous: number
}

interface TooltipEntry {
  dataKey?: string | number
  value?: number | null
}

interface MetricTooltipProps {
  active?: boolean
  label?: string
  payload?: TooltipEntry[]
  tile: MetricTile
  compareLabel: string
}

function MetricTooltip({ active, label, payload, tile, compareLabel }: MetricTooltipProps) {
  if (!active || !payload?.length) return null
  const current = payload.find((entry) => entry.dataKey === 'current')?.value
  const previous = payload.find((entry) => entry.dataKey === 'previous')?.value
  return (
    <div className="min-w-[170px] rounded-xl bg-wn-ink px-3.5 py-2.5 text-xs text-white shadow-lg">
      <p className="mb-1.5 font-bold">{label}</p>
      {current !== undefined && current !== null && (
        <p className="flex items-center gap-2 text-white/70">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METRIC_STYLES[tile.key].color }} />
          {tile.label}
          <span className="ml-auto pl-3 font-bold tabular-nums text-white">{formatValue(tile, current)}</span>
        </p>
      )}
      {previous !== undefined && previous !== null && (
        <p className="mt-0.5 flex items-center gap-2 text-white/70">
          <span className="inline-block w-2 border-t-2 border-dashed" style={{ borderColor: SERIES_PREVIOUS }} />
          <span>{sentenceCase(compareLabel)}</span>
          <span className="ml-auto pl-3 font-bold tabular-nums text-white">{formatValue(tile, previous)}</span>
        </p>
      )}
    </div>
  )
}

interface MetricChartProps {
  tile: MetricTile
  labels: string[]
  compareLabel: string
}

function MetricChart({ tile, labels, compareLabel }: MetricChartProps) {
  const color = METRIC_STYLES[tile.key].color
  const rows: ChartRow[] = labels.map((label, i) => ({
    label,
    current: tile.series[i] ?? null,
    previous: tile.previousSeries[i] ?? 0,
  }))
  const hasData = rows.some((row) => (row.current ?? 0) > 0 || row.previous > 0)

  if (!hasData) {
    return (
      <ChartEmptyState
        className="mx-2 h-56"
        title={`No ${tile.label.toLowerCase()} in this period yet`}
        hint="This fills in as orders are paid or delivered."
      />
    )
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> This period
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: SERIES_PREVIOUS }} />
          <span>{sentenceCase(compareLabel)}</span>
        </span>
      </div>
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`metric-fill-${tile.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#E5E0D6" strokeDasharray="2 4" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickFormatter={(value: number) => (tile.kind === 'money' ? formatPesoCompact(value) : formatCount(value))}
            />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3 }}
              content={<MetricTooltip tile={tile} compareLabel={compareLabel} />}
            />
            <Line
              type="monotone"
              dataKey="previous"
              stroke={SERIES_PREVIOUS}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="current"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#metric-fill-${tile.key})`}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
