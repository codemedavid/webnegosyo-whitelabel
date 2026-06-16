import { Suspense } from 'react'
import { Receipt, Store, TrendingUp, Wallet } from 'lucide-react'
import { getTenants } from '@/lib/queries/tenants-server'
import {
  getPlatformAnalytics,
  getFeatureAdoption,
} from '@/lib/queries/platform-analytics-server'
import { BulkDeployButton } from '@/components/superadmin/bulk-deploy-button'
import { PageHeader, KpiCard } from '@/components/superadmin/ui/primitives'
import { formatCurrency, formatCurrencyCompact, formatNumber } from '@/components/superadmin/ui/format'
import { PlatformTrend } from '@/components/superadmin/dashboard/platform-trend'
import { FeatureAdoption } from '@/components/superadmin/dashboard/feature-adoption'
import { RecentRestaurants } from '@/components/superadmin/dashboard/recent-restaurants'
import { QuickActions } from '@/components/superadmin/dashboard/quick-actions'
import {
  DashboardKpiSkeleton,
  PlatformTrendSkeleton,
  FeatureAdoptionSkeleton,
  RecentRestaurantsSkeleton,
} from '@/components/superadmin/dashboard/skeletons'

// Cache the dashboard for 60s to avoid repeated DB hits on navigation
export const revalidate = 60

/**
 * Headline KPIs + the all-time revenue trend + feature adoption.
 *
 * All-time data drives the headline numbers (recent volume is near-zero at
 * current scale, so an all-time view is the only meaningful default), while a
 * 30d window supplies the trend deltas on the GMV/orders cards.
 */
async function OverviewSection() {
  const [allTime, recent, adoption] = await Promise.all([
    getPlatformAnalytics('all'),
    getPlatformAnalytics('30d'),
    getFeatureAdoption(),
  ])

  const { kpis, timeSeries } = allTime
  const activePct = adoption.total ? Math.round((adoption.active / adoption.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total GMV"
          value={formatCurrencyCompact(kpis.gmv)}
          icon={Wallet}
          delta={recent.kpis.gmvDelta}
          hint={`${formatCurrency(kpis.gmv)} all-time · 30d trend`}
        />
        <KpiCard
          label="Total orders"
          value={formatNumber(kpis.orders)}
          icon={Receipt}
          delta={recent.kpis.ordersDelta}
          hint={`${formatNumber(recent.kpis.orders)} in last 30 days`}
        />
        <KpiCard
          label="Avg order value"
          value={formatCurrency(kpis.aov)}
          icon={TrendingUp}
          hint="Across all completed orders"
        />
        <KpiCard
          label="Active restaurants"
          value={formatNumber(adoption.active)}
          icon={Store}
          hint={`${activePct}% of ${adoption.total} on the platform`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PlatformTrend data={timeSeries} totalGmv={kpis.gmv} totalOrders={kpis.orders} />
        </div>
        <FeatureAdoption data={adoption} />
      </div>
    </div>
  )
}

/** Recent restaurants list + operational side rail (deploy + quick actions). */
async function DirectorySection() {
  const { data: tenants } = await getTenants({ pageSize: 8 })

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <RecentRestaurants tenants={tenants} />
      </div>
      <div className="space-y-6">
        <BulkDeployButton />
        <QuickActions />
      </div>
    </div>
  )
}

export default function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform" title="Dashboard" subtitle="Platform overview and management" />

      <Suspense
        fallback={
          <div className="space-y-6">
            <DashboardKpiSkeleton />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <PlatformTrendSkeleton />
              </div>
              <FeatureAdoptionSkeleton />
            </div>
          </div>
        }
      >
        <OverviewSection />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentRestaurantsSkeleton />
            </div>
            <div className="space-y-6">
              <div className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
              <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
            </div>
          </div>
        }
      >
        <DirectorySection />
      </Suspense>
    </div>
  )
}
