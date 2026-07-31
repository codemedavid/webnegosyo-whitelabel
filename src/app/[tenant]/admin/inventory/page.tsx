import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import {
  getScopedIngredients,
  getBranchStockSummaries,
} from '@/lib/inventory/branch-stock-read'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { seedDefaultUnits } from '@/lib/inventory/units-service'
import { InventoryManager } from '@/components/admin/inventory-manager'
import { StockAlertsBanner } from '@/components/admin/stock-alerts-banner'
import { getOpenStockAlerts } from '@/lib/inventory/stock-alerts-read'
import { scopeStockAlerts } from '@/lib/inventory/stock-alerts-view'
import { getCachedLastPurchaseDates } from '@/lib/inventory/last-purchase'
import { getRecipeCoverage } from '@/lib/inventory/recipe-coverage-read'
import { getInventoryActivity } from '@/lib/inventory/activity-feed-read'
import { explainAutoHiddenDishes } from '@/lib/inventory/auto-86-blame'
import { summarizeInventoryHealth } from '@/lib/inventory/inventory-health'
import { getDailyInventoryReport } from '@/lib/inventory/daily-report-read'
import { getOpenCount, getCountProgress } from '@/lib/inventory/count-session-service'
import type { CountSessionProgress } from '@/lib/inventory/count-session'
import { getDailyRevenue } from '@/lib/inventory/daily-revenue-read'
import { resolveReportScope } from '@/lib/inventory/report-scope'
import { resolveReportDay } from '@/lib/inventory/business-day'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { Tenant } from '@/types/database'

export default async function AdminInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ tab?: string; day?: string; stock?: string; reason?: string }>
}) {
  const { tenant: tenantSlug } = await params
  // `stock` and `reason` carry a merchant across from the daily report: a row
  // that came up short links here with the count already chosen, so the answer
  // to "something is missing" is one tap rather than a hunt.
  const { tab, day, stock, reason } = await searchParams

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
  //
  // Quantities are read as whoever is looking: the owner's roll-up across every
  // branch, or one branch's own shelf. A manager shown the chain total would
  // count their shelf short against it.
  const scope = resolveBranchScope((await getCachedCurrentUserRole()) ?? { role: '' })

  const [units, ingredients, openAlerts, lastPurchaseByItemId] = await Promise.all([
    seedDefaultUnits(tenant.id),
    getScopedIngredients(tenant.id, scope),
    getOpenStockAlerts(tenant.id),
    getCachedLastPurchaseDates(tenant.id),
  ])

  // The banner is scoped to match the quantities under it. `stock_alerts` rows
  // are raised store-wide and carry no branch, so a branch manager was shown
  // the chain's low-stock warnings sitting directly above their own branch's
  // figures — two numbers on one screen disagreeing about the same shelf.
  // A store-wide account passes its own roll-up in and keeps every alert.
  const alerts = scopeStockAlerts(openAlerts, ingredients)

  // Recipe coverage answers "which dishes are actually set up?" — the question
  // that had no surface at all, and the reason a tenant could switch inventory
  // on and have it quietly do nothing.
  const { coverageRows, recipeComponents, menuItems, recipes, loadFailed } =
    await getRecipeCoverage(tenant.id)

  // The Overview answers "what is this thing doing, and where can it not?" —
  // questions that had no surface at all, and the reason a tenant could switch
  // inventory on, have it deduct nothing, and see a working system's quiet day.
  const activity = await getInventoryActivity(tenant.id, ingredients)

  // The owner's cross-branch view: which shop holds what, and which has run out.
  // Empty for a single-shop store, so the panel never appears for the majority
  // of tenants.
  const branchStockByItemId = await getBranchStockSummaries(
    tenant.id,
    ingredients.map((item) => item.id),
  )
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
  //
  // Scoped to whoever is looking, matching the quantities above it. A branch
  // admin was previously shown every branch's movements reconciled into one
  // day and presented as their own — the same mismatch the merchant app
  // guarded against by withholding, except the web showed it.
  const reportScope = resolveReportScope({ scope, orderBackend: tenant.order_backend ?? null })

  let dailyReport: DailyInventoryReportForDay | undefined
  try {
    dailyReport = await getDailyInventoryReport(tenant.id, dayKey, reportScope.outletId)
  } catch (error) {
    console.error('[inventory] daily report read failed', { tenantId: tenant.id, dayKey, error })
  }

  // The takings come from wherever this tenant's orders live, which is not
  // necessarily this database. `getDailyRevenue` never throws and returns null
  // when it cannot tell — the panel then omits the percentage and says why,
  // rather than dividing by a zero it invented.
  //
  // `undefined` rather than null when the takings cannot be narrowed to the
  // branch being shown: the panel omits the card entirely, which is honest,
  // where null would say "could not be read" and imply the figure would
  // otherwise have been theirs to see. See `resolveReportScope`.
  const dailyRevenue = !dailyReport
    ? null
    : reportScope.isRevenueBranchScoped
      ? await getDailyRevenue(tenant, dayKey, {}, reportScope.outletId)
      : undefined

  // The count running on this shelf, if one is. Wrapped because a failure here
  // must cost the count panel and nothing else: the merchant can still see
  // their stock, record deliveries, and read the report. The panel then offers
  // to start a count, which is the honest fallback — it is what a merchant with
  // no count running sees, and starting a second one joins the first anyway.
  let openCountId: string | null = null
  let countProgress: CountSessionProgress | null = null
  try {
    // The count belongs to the same shelf the report reconciles. Until that
    // read was branch-aware this had to be the store pool, because a
    // branch-scoped count would have described a narrower shelf than the
    // report did and reported coverage against the wrong denominator.
    const openCount = await getOpenCount(tenant.id, reportScope.outletId)
    if (openCount) {
      openCountId = openCount.id
      countProgress = await getCountProgress(tenant.id, openCount.id)
    }
  } catch (error) {
    console.error('[inventory] count session read failed', { tenantId: tenant.id, error })
  }

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
        branchStockByItemId={branchStockByItemId}
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
        stockItemId={stock}
        stockReason={reason}
        openCountId={openCountId}
        countProgress={countProgress}
      />
    </div>
  )
}
