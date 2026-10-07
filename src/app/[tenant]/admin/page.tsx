import { Suspense } from 'react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { hasPermission } from '@/lib/staff-permissions'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { parseDashboardRange, type DashboardRange } from '@/lib/dashboard/periods'
import { loadAdminDashboard, type AdminDashboardData } from '@/lib/dashboard/load-admin-dashboard'
import { readLiveOrderStats } from '@/lib/dashboard/live-orders'
import { AnalyticsDashboardSkeleton } from '@/components/admin/dashboard/analytics-dashboard-skeleton'
import { BestSellersCard } from '@/components/admin/dashboard/best-sellers-card'
import { BusiestHoursCard } from '@/components/admin/dashboard/busiest-hours-card'
import { buildGrowthActions } from '@/components/admin/dashboard/dashboard-copy'
import { DashboardHeader } from '@/components/admin/dashboard/dashboard-header'
import { buildMetricTiles } from '@/components/admin/dashboard/dashboard-metrics'
import { DashboardNotes } from '@/components/admin/dashboard/dashboard-notes'
import { DashboardToolbar } from '@/components/admin/dashboard/dashboard-toolbar'
import { LiveOrdersStrip } from '@/components/admin/dashboard/live-orders-strip'
import { MetricsPanel } from '@/components/admin/dashboard/metrics-panel'
import { TodoCard } from '@/components/admin/dashboard/todo-card'
import { WhoIsBuyingCard } from '@/components/admin/dashboard/who-is-buying-card'
import type { Tenant } from '@/types/database'

interface AdminDashboardProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ range?: string | string[] }>
}

const UPDATED_AT = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-white p-6 text-center">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

/** The cards under the key metrics; each appears only when the account may see its data. */
function DashboardCards({ data, tenantSlug }: { data: AdminDashboardData; tenantSlug: string }) {
  const { growth, overview } = data
  const actions = growth
    ? buildGrowthActions({
        actions: growth.actions,
        loyalty: growth.loyalty,
        capture: growth.capture,
        hasLoyaltyProgram: growth.hasLoyaltyProgram,
        isBranchView: growth.isBranchView,
        hrefs: { customers: `/${tenantSlug}/admin/customers`, loyalty: `/${tenantSlug}/admin/loyalty` },
      })
    : []

  return (
    <>
      {growth && (
        <div className="grid gap-5 lg:grid-cols-5">
          <TodoCard actions={actions} reachable={growth.reachable} className="lg:col-span-3" />
          <WhoIsBuyingCard current={growth.customers.current} className="lg:col-span-2" />
        </div>
      )}
      {overview && (
        <div className="grid gap-5 lg:grid-cols-5">
          <BestSellersCard items={overview.topItems} className="lg:col-span-2" />
          <BusiestHoursCard hours={overview.hours} busiestHour={overview.busiestHour} className="lg:col-span-3" />
        </div>
      )}
    </>
  )
}

async function DashboardContent({
  tenant,
  tenantSlug,
  range,
}: {
  tenant: Tenant
  tenantSlug: string
  range: DashboardRange
}) {
  let userRole: Awaited<ReturnType<typeof verifyTenantAdmin>>['userRole']
  try {
    ;({ userRole } = await verifyTenantAdmin(tenant.id, 'view'))
  } catch {
    return <ErrorState title="You don't have access to this dashboard." detail="Ask the store owner for access." />
  }

  const canSeeSales = hasPermission(userRole, 'analytics')
  const canSeeCustomers = hasPermission(userRole, 'customers')
  // The strip reads the order queue and links to /orders; without the grant the
  // read is refused and the link bounces, so the strip is left out entirely
  // rather than claiming the orders "couldn't be read".
  const canSeeOrders = hasPermission(userRole, 'orders')
  const scope = resolveBranchScope(userRole)
  const basePath = `/${tenantSlug}/admin`

  const [liveStats, data] = await Promise.all([
    canSeeOrders ? readLiveOrderStats(tenant) : Promise.resolve(null),
    canSeeSales || canSeeCustomers
      ? loadAdminDashboard(tenant.id, {
          range,
          outletId: scope.kind === 'branch' ? scope.outletId : null,
          includeOverview: canSeeSales,
          includeGrowth: canSeeCustomers,
        })
      : Promise.resolve(null),
  ])

  const liveStrip = canSeeOrders ? <LiveOrdersStrip stats={liveStats} ordersHref={`${basePath}/orders`} /> : null
  if (!data) {
    return (
      <div className="space-y-6">
        {liveStrip}
        <p className="rounded-2xl border border-dashed border-border bg-white/60 px-5 py-8 text-center text-sm text-muted-foreground">
          Sales and customer numbers are hidden for your account. Ask the store owner if you need them.
        </p>
      </div>
    )
  }

  const tiles = buildMetricTiles({ customers: data.growth?.customers ?? null, overview: data.overview })
  const labels = data.overview?.labels ?? data.growth?.customers.trend.map((row) => row.label) ?? []

  return (
    <div className="space-y-6">
      {liveStrip}
      <DashboardToolbar basePath={basePath} range={range} />
      {!data.failed && <DashboardNotes notes={data.notes} />}
      {data.failed ? (
        <ErrorState
          title="We couldn't load your numbers."
          detail={data.notes[0] ?? 'This is a problem on our side, not missing data. Please refresh.'}
        />
      ) : (
        <>
          <MetricsPanel tiles={tiles} labels={labels} compareLabel={data.compareLabel} />
          <DashboardCards data={data} tenantSlug={tenantSlug} />
          <p className="text-right text-xs font-medium text-muted-foreground">
            Updated {UPDATED_AT.format(new Date(data.generatedAt))} · refreshes every 2 minutes
          </p>
        </>
      )}
    </div>
  )
}

export default async function AdminDashboard({ params, searchParams }: AdminDashboardProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const range = parseDashboardRange(query.range)

  return (
    <div className="space-y-6">
      <DashboardHeader storeName={tenant.name} storefrontHref={`/${tenantSlug}/menu`} now={new Date()} />

      <Suspense key={range} fallback={<AnalyticsDashboardSkeleton />}>
        <DashboardContent tenant={tenant} tenantSlug={tenantSlug} range={range} />
      </Suspense>
    </div>
  )
}
