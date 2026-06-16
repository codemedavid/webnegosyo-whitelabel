import Link from 'next/link'
import { DollarSign, ShoppingCart, Receipt, CheckCircle2, XCircle } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader, KpiCard } from '@/components/superadmin/ui/primitives'
import { formatCurrency, formatNumber, formatPercent } from '@/components/superadmin/ui/format'
import { AnalyticsDashboard } from '@/components/superadmin/analytics/analytics-dashboard'
import { TopActiveTenants } from '@/components/superadmin/analytics/top-active-tenants'
import {
  getPlatformAnalytics,
  getTenantGrowth,
  getFeatureAdoption,
  type AnalyticsRange,
} from '@/lib/queries/platform-analytics-server'

// Cache the platform analytics for 60s.
export const revalidate = 60

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
}

function isRange(value: string | undefined): value is AnalyticsRange {
  return value === '7d' || value === '30d' || value === '90d' || value === 'all'
}

/** Server-rendered range switcher styled like the RangeTabs pill group.
 *  Active state derives from the `range` prop, so no client boundary is needed. */
function RangeSwitcher({ range }: { range: AnalyticsRange }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
      {RANGE_OPTIONS.map((opt) => {
        const isActive = opt.value === range
        return (
          <Link
            key={opt.value}
            href={`/superadmin/analytics?range=${opt.value}`}
            scroll={false}
            aria-current={isActive ? 'true' : undefined}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-white text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}

interface AnalyticsPageProps {
  // Recent windows are near-empty, so we default to 'all'.
  searchParams: Promise<{ range?: string }>
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const params = await searchParams
  const range: AnalyticsRange = isRange(params.range) ? params.range : 'all'
  const rangeLabel = RANGE_LABELS[range]

  const [analytics, growth, adoption] = await Promise.all([
    getPlatformAnalytics(range),
    getTenantGrowth(),
    getFeatureAdoption(),
  ])

  const { kpis } = analytics

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Analytics' },
        ]}
      />

      <PageHeader
        eyebrow="Platform Insights"
        title="Analytics"
        subtitle="Revenue, orders and adoption across every restaurant on the platform"
        actions={<RangeSwitcher range={range} />}
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="GMV"
          value={formatCurrency(kpis.gmv)}
          icon={DollarSign}
          delta={kpis.gmvDelta}
          hint={rangeLabel}
        />
        <KpiCard
          label="Orders"
          value={formatNumber(kpis.orders)}
          icon={ShoppingCart}
          delta={kpis.ordersDelta}
          hint={rangeLabel}
        />
        <KpiCard
          label="Avg. order value"
          value={formatCurrency(kpis.aov)}
          icon={Receipt}
          hint="Per order"
        />
        <KpiCard
          label="Completed"
          value={formatNumber(kpis.completed)}
          icon={CheckCircle2}
          hint="Delivered orders"
        />
        <KpiCard
          label="Cancel rate"
          value={formatPercent(kpis.cancelRate, 1)}
          icon={XCircle}
          hint={`${formatNumber(kpis.cancelled)} cancelled`}
        />
      </div>

      {/* Charts & breakdowns */}
      <AnalyticsDashboard
        analytics={analytics}
        growth={growth}
        adoption={adoption}
        rangeLabel={rangeLabel}
      />

      {/* Revenue leaderboard */}
      <TopActiveTenants tenants={analytics.topByRevenue} rangeLabel={rangeLabel} />
    </div>
  )
}
