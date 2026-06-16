import { ShoppingBag, Smartphone, Store, TrendingUp } from 'lucide-react'
import { KpiCard } from '@/components/superadmin/ui/primitives'
import {
  formatCompact,
  formatCurrencyCompact,
  formatPercent,
} from '@/components/superadmin/ui/format'
import type { TenantsOverview } from '@/lib/queries/tenant-metrics-server'

/**
 * Platform-wide tenant KPI strip. Server-compatible (no hooks) — rendered
 * directly inside a Suspense boundary on the tenants page.
 */
export function TenantOverview({ overview }: { overview: TenantsOverview }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        label="Restaurants"
        value={overview.total}
        hint={`${overview.active} active · ${overview.inactive} inactive`}
        icon={Store}
      />
      <KpiCard
        label="Orders · 30d"
        value={formatCompact(overview.orders30d)}
        icon={ShoppingBag}
      />
      <KpiCard
        label="GMV · 30d"
        value={formatCurrencyCompact(overview.gmv30d)}
        icon={TrendingUp}
      />
      <KpiCard
        label="Mobile App"
        value={overview.app}
        hint={`${formatPercent(overview.total ? overview.app / overview.total : 0)} of tenants`}
        icon={Smartphone}
      />
    </div>
  )
}
