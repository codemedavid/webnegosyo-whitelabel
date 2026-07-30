import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { seedDefaultUnits } from '@/lib/inventory/units-service'
import { InventoryManager } from '@/components/admin/inventory-manager'
import { StockAlertsBanner } from '@/components/admin/stock-alerts-banner'
import { getOpenStockAlerts } from '@/lib/inventory/stock-alerts-read'
import { getCachedLastPurchaseDates } from '@/lib/inventory/last-purchase'
import { getRecipeCoverage } from '@/lib/inventory/recipe-coverage-read'
import { getInventoryActivity } from '@/lib/inventory/activity-feed-read'
import { explainAutoHiddenDishes } from '@/lib/inventory/auto-86-blame'
import { summarizeInventoryHealth } from '@/lib/inventory/inventory-health'
import { getDailyInventoryReport } from '@/lib/inventory/daily-report-read'
import { getDailyRevenue } from '@/lib/inventory/daily-revenue-read'
import { resolveReportDay } from '@/lib/inventory/business-day'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { Tenant } from '@/types/database'

export default async function AdminInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ tab?: string; day?: string }>
}) {
  const { tenant: tenantSlug } = await params
  const { tab, day } = await searchParams

  const tenantData = await getCachedTenantBySlug(tenantSlug)
  if (!tenantData) {
    return <div>Tenant not found</div>
  }
  const tenant: Tenant = tenantData

  // Inventory is an opt-in feature; keep the route unreachable when disabled so
  // it never appears as a half-configured surface.
  if (!tenant.inventory_enabled) {
    notFound()
  }

  // Seed the default unit catalog on first visit so ingredients always have a
  // unit to reference. Idempotent — existing units are returned untouched.
  // Open alerts need no feature-flag check of their own: when a tenant has
  // low-stock alerts switched off, nothing writes them, so the list is empty
  // and the banner renders nothing.
  const [units, ingredients, alerts, lastPurchaseByItemId] = await Promise.all([
    seedDefaultUnits(tenant.id),
    getIngredients(tenant.id),
    getOpenStockAlerts(tenant.id),
    getCachedLastPurchaseDates(tenant.id),
  ])

  // Recipe coverage answers "which dishes are actually set up?" — the question
  // that had no surface at all, and the reason a tenant could switch inventory
  // on and have it quietly do nothing.
  const { coverageRows, recipeComponents, menuItems, recipes, loadFailed } =
    await getRecipeCoverage(tenant.id)

  // The Overview answers "what is this thing doing, and where can it not?" —
  // questions that had no surface at all, and the reason a tenant could switch
  // inventory on, have it deduct nothing, and see a working system's quiet day.
  const activity = await getInventoryActivity(tenant.id, ingredients)
  const autoHidden = explainAutoHiddenDishes(menuItems, recipes, recipeComponents, ingredients)
  const health = summarizeInventoryHealth({
    ingredients,
    coverage: coverageRows,
    autoHiddenCount: autoHidden.length,
    flags: {
      lowStockAlertsEnabled: Boolean(tenant.low_stock_alerts_enabled),
      auto86Enabled: Boolean(tenant.auto_86_enabled),
    },
  })

  // The report reconciles one Manila day: what the trade took off the shelf and
  // what it cost. A failure here must not take the rest of inventory down with
  // it — the tab simply does not appear, which is honest about having no
  // figures rather than showing a day that looks empty.
  const { dayKey, latestDayKey } = resolveReportDay(day, new Date().toISOString())
  let dailyReport: DailyInventoryReportForDay | undefined
  try {
    dailyReport = await getDailyInventoryReport(tenant.id, dayKey)
  } catch (error) {
    console.error('[inventory] daily report read failed', { tenantId: tenant.id, dayKey, error })
  }

  // The takings come from wherever this tenant's orders live, which is not
  // necessarily this database. `getDailyRevenue` never throws and returns null
  // when it cannot tell — the panel then omits the percentage and says why,
  // rather than dividing by a zero it invented.
  const dailyRevenue = dailyReport ? await getDailyRevenue(tenant, dayKey) : null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'Inventory' }]}
      />

      <div>
        <h1 className="text-3xl font-bold">Inventory</h1>
        <p className="text-muted-foreground">
          Track ingredients and their cost per unit. Recipes built from these ingredients power the
          true cost and margin of menu items, variations, and modifier options.
        </p>
      </div>

      <StockAlertsBanner alerts={alerts} />

      <InventoryManager
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialIngredients={ingredients}
        initialUnits={units}
        lastPurchaseByItemId={lastPurchaseByItemId}
        coverageRows={coverageRows}
        recipeComponents={recipeComponents}
        coverageLoadFailed={loadFailed}
        health={health}
        autoHidden={autoHidden}
        activity={activity.entries}
        activityLoadFailed={activity.loadFailed}
        dailyReport={dailyReport}
        dailyRevenue={dailyRevenue}
        latestDayKey={latestDayKey}
        defaultTab={tab}
      />
    </div>
  )
}
