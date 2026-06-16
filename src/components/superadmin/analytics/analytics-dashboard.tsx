'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  CreditCard,
  LineChart,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react'
import {
  Panel,
  SectionHeader,
  RangeTabs,
  EmptyState,
} from '@/components/superadmin/ui/primitives'
import { formatCurrency, formatNumber, formatPercent } from '@/components/superadmin/ui/format'
import { TrendAreaChart, DonutChart } from '@/components/superadmin/analytics/charts'
import type {
  CategorySlice,
  GrowthBucket,
  FeatureAdoption,
  PlatformAnalytics,
} from '@/lib/queries/platform-analytics-server'

/* =============================================================================
   Client-side data-viz shell for the platform analytics surface.
   Owns only ephemeral view state (trend metric toggle). All numbers come from
   the server via props — no fetching here.
   ========================================================================== */

interface AnalyticsDashboardProps {
  analytics: PlatformAnalytics
  growth: GrowthBucket[]
  adoption: FeatureAdoption
  rangeLabel: string
}

/** Semantic colors for each fulfillment-funnel stage. */
const STATUS_STYLE: Record<string, { dot: string; bar: string; text: string }> = {
  pending: { dot: 'bg-amber-400', bar: 'bg-amber-400/30', text: 'text-amber-400' },
  confirmed: { dot: 'bg-sky-400', bar: 'bg-sky-400/30', text: 'text-sky-400' },
  preparing: { dot: 'bg-indigo-400', bar: 'bg-indigo-400/30', text: 'text-indigo-400' },
  ready: { dot: 'bg-sky-400', bar: 'bg-sky-400/30', text: 'text-sky-400' },
  delivered: { dot: 'bg-emerald-400', bar: 'bg-emerald-400/30', text: 'text-emerald-400' },
  cancelled: { dot: 'bg-red-400', bar: 'bg-red-400/30', text: 'text-red-400' },
}

const FALLBACK_STATUS_STYLE = { dot: 'bg-white/40', bar: 'bg-white/20', text: 'text-white/60' }

function statusStyle(label: string) {
  return STATUS_STYLE[label.toLowerCase()] ?? FALLBACK_STATUS_STYLE
}

export function AnalyticsDashboard({ analytics, growth, adoption, rangeLabel }: AnalyticsDashboardProps) {
  const { timeSeries, statusBreakdown, orderTypeBreakdown, paymentBreakdown } = analytics

  return (
    <div className="space-y-5">
      {/* Trend — full width hero chart with metric toggle. */}
      <TrendPanel data={timeSeries} rangeLabel={rangeLabel} />

      {/* Order types + Payment methods donuts. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-5">
          <SectionHeader icon={UtensilsCrossed} title="Order types" subtitle={rangeLabel} />
          <DonutsOrEmpty
            data={orderTypeBreakdown}
            centerLabel="Orders"
            emptyTitle="No order types yet"
          />
        </Panel>

        <Panel className="space-y-5">
          <SectionHeader icon={CreditCard} title="Payment methods" subtitle={rangeLabel} />
          <DonutsOrEmpty
            data={paymentBreakdown}
            centerLabel="Orders"
            emptyTitle="No payments recorded"
          />
        </Panel>
      </div>

      {/* Status funnel + Platform growth. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-5">
          <SectionHeader icon={Activity} title="Fulfillment funnel" subtitle="Orders by status" />
          <StatusFunnel data={statusBreakdown} />
        </Panel>

        <GrowthPanel growth={growth} />
      </div>

      {/* Feature adoption. */}
      <FeatureAdoptionPanel adoption={adoption} />
    </div>
  )
}

/* ── Trend panel ──────────────────────────────────────────────────────────── */

function TrendPanel({
  data,
  rangeLabel,
}: {
  data: PlatformAnalytics['timeSeries']
  rangeLabel: string
}) {
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue')

  const total = useMemo(
    () => data.reduce((s, d) => s + (metric === 'revenue' ? d.revenue : d.orders), 0),
    [data, metric],
  )

  return (
    <Panel className="space-y-5">
      <SectionHeader
        icon={LineChart}
        title="Revenue & order trend"
        subtitle={
          <span className="tabular-nums">
            {metric === 'revenue' ? formatCurrency(total) : `${formatNumber(total)} orders`} · {rangeLabel}
          </span>
        }
        action={
          <RangeTabs
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'revenue', label: 'Revenue' },
              { value: 'orders', label: 'Orders' },
            ]}
          />
        }
      />

      {data.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No activity in this window"
          description="Switch to a longer range to see the trend."
        />
      ) : (
        <TrendAreaChart data={data} metric={metric} height={300} />
      )}
    </Panel>
  )
}

/* ── Donut wrapper ────────────────────────────────────────────────────────── */

function DonutsOrEmpty({
  data,
  centerLabel,
  emptyTitle,
}: {
  data: CategorySlice[]
  centerLabel: string
  emptyTitle: string
}) {
  const meaningful = data.filter((d) => d.count > 0)
  if (meaningful.length === 0) {
    return <EmptyState icon={Sparkles} title={emptyTitle} description="No orders in this period." />
  }
  return (
    <DonutChart
      data={meaningful.map((d) => ({ label: d.label, count: d.count }))}
      centerLabel={centerLabel}
      height={196}
    />
  )
}

/* ── Status funnel ────────────────────────────────────────────────────────── */

function StatusFunnel({ data }: { data: CategorySlice[] }) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 0)

  if (max === 0) {
    return <EmptyState icon={Activity} title="No orders to fulfill" description="No orders in this period." />
  }

  const totalCount = data.reduce((s, d) => s + d.count, 0) || 1

  return (
    <div className="space-y-2.5">
      {data.map((slice) => {
        const style = statusStyle(slice.label)
        const width = Math.max(2, (slice.count / max) * 100)
        const share = Math.round((slice.count / totalCount) * 100)

        return (
          <div
            key={slice.label}
            className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
          >
            <div
              className={`absolute inset-y-0 left-0 rounded-lg ${style.bar}`}
              style={{ width: `${width}%` }}
            />
            <div className="relative flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                <span className={`truncate font-medium capitalize ${style.text}`}>{slice.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5 tabular-nums">
                <span className="text-xs text-white/40">{share}%</span>
                <span className="font-semibold text-white">{formatNumber(slice.count)}</span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Platform growth ──────────────────────────────────────────────────────── */

function GrowthPanel({ growth }: { growth: GrowthBucket[] }) {
  // Map cumulative tenant count into the chart's {label, orders, revenue} shape;
  // we render the cumulative line via the "orders" metric.
  const series = useMemo(
    () => growth.map((g) => ({ label: g.label, orders: g.cumulative, revenue: 0 })),
    [growth],
  )

  const totalTenants = growth.length ? growth[growth.length - 1].cumulative : 0
  const latestNew = growth.length ? growth[growth.length - 1].newTenants : 0

  return (
    <Panel className="space-y-5">
      <SectionHeader
        icon={TrendingUp}
        title="Platform growth"
        subtitle={
          <span className="tabular-nums">
            {formatNumber(totalTenants)} restaurants · +{formatNumber(latestNew)} this month
          </span>
        }
      />
      {series.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No growth data" description="No tenants recorded yet." />
      ) : (
        <TrendAreaChart data={series} metric="orders" height={220} />
      )}
    </Panel>
  )
}

/* ── Feature adoption ─────────────────────────────────────────────────────── */

interface AdoptionRow {
  label: string
  count: number
  accent: { bar: string; text: string }
}

function FeatureAdoptionPanel({ adoption }: { adoption: FeatureAdoption }) {
  const denom = adoption.total || 1
  const rows: AdoptionRow[] = [
    { label: 'Active restaurants', count: adoption.active, accent: { bar: 'bg-emerald-400', text: 'text-emerald-400' } },
    { label: 'Menu engineering', count: adoption.menuEngineering, accent: { bar: 'bg-indigo-400', text: 'text-indigo-400' } },
    { label: 'Bundles', count: adoption.bundles, accent: { bar: 'bg-amber-400', text: 'text-amber-400' } },
    { label: 'Mobile app', count: adoption.app, accent: { bar: 'bg-sky-400', text: 'text-sky-400' } },
    { label: 'Lalamove delivery', count: adoption.lalamove, accent: { bar: 'bg-purple-400', text: 'text-purple-400' } },
  ]

  return (
    <Panel className="space-y-5">
      <SectionHeader
        icon={ShoppingBag}
        title="Feature adoption"
        subtitle={`Across ${formatNumber(adoption.total)} restaurants`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const pct = row.count / denom
          return (
            <div
              key={row.label}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-white/70">{row.label}</span>
                <span className={`text-xs font-medium tabular-nums ${row.accent.text}`}>
                  {formatPercent(pct)}
                </span>
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-2xl font-bold tracking-tight text-white tabular-nums">
                  {formatNumber(row.count)}
                </span>
                <span className="mb-1 text-xs text-white/40 tabular-nums">/ {formatNumber(adoption.total)}</span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${row.accent.bar}`}
                  style={{ width: `${Math.max(2, pct * 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
