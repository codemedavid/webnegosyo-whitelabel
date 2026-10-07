import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import {
  getScopedIngredients,
  getBranchStockSummaries,
} from '@/lib/inventory/branch-stock-read'
import { resolveBranchScope, type BranchScope } from '@/lib/outlets/branch-scope'
import { seedDefaultUnits } from '@/lib/inventory/units-service'
import { InventoryManager } from '@/components/admin/inventory-manager'
import { StockAlertsBanner } from '@/components/admin/stock-alerts-banner'
import { StockReconciliationBanner } from '@/components/admin/stock-reconciliation-banner'
import { getStockReconciliationIssues } from '@/lib/inventory/reconciliation'
import { getOpenStockAlerts } from '@/lib/inventory/stock-alerts-read'
import { scopeStockAlerts } from '@/lib/inventory/stock-alerts-view'
import { getCachedLastPurchaseDates } from '@/lib/inventory/last-purchase'
import { getRecipeCoverage } from '@/lib/inventory/recipe-coverage-read'
import { getInventoryActivity } from '@/lib/inventory/activity-feed-read'
import { explainAutoHiddenDishes } from '@/lib/inventory/auto-86-blame'
import { summarizeInventoryHealth, type InventoryFlags } from '@/lib/inventory/inventory-health'
import { getDailyInventoryReport } from '@/lib/inventory/daily-report-read'
import {
  getOpenCount,
  getAnyOpenCount,
  getCountProgress,
} from '@/lib/inventory/count-session-service'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import type { CountSessionProgress } from '@/lib/inventory/count-session'
import { getDailyRevenue } from '@/lib/inventory/daily-revenue-read'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'
import { resolveReportScope } from '@/lib/inventory/report-scope'
import { resolveReportDay } from '@/lib/inventory/business-day'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { NamedBranch } from '@/lib/inventory/branch-stock-view'
import type { Outlet, Tenant } from '@/types/database'

/**
 * The cached tenant row carries no credentials (they live in tenant_secrets),
 * but the revenue read needs the Convex deploy key to reach a Convex-backed
 * store. Read failures degrade to "no key": `getDailyRevenue` then reports the
 * takings as unreadable, which is what the panel is built to say.
 */
async function withOrderCredentials(tenant: Tenant): Promise<Tenant> {
  try {
    return mergeTenantSecrets(tenant, await getTenantSecrets(createAdminClient(), tenant.id))
  } catch (error) {
    console.error('[inventory] could not read tenant secrets:', error instanceof Error ? error.message : error)
    return tenant
  }
}

/**
 * Which branches a movement may be aimed at. A failed read degrades to the
 * single-shelf dialog rather than taking the page down: recording to the store
 * pool is the behaviour every tenant had until branches existed.
 */
function readOutlets(tenantId: string): Promise<Outlet[]> {
  return createSupabaseOutletRepository()
    .listByTenant(tenantId)
    .catch((error) => {
      console.error('[inventory] outlets read failed', { tenantId, error })
      return []
    })
}

function activeBranchesOf(outlets: readonly Outlet[]): NamedBranch[] {
  return outlets.filter((outlet) => outlet.is_active).map((o) => ({ id: o.id, name: o.name }))
}

/**
 * A failure here must not take the rest of inventory down with it — the tab
 * simply does not appear, which is honest about having no figures rather than
 * showing a day that looks empty.
 */
async function readDailyReport(
  tenantId: string,
  dayKey: string,
  outletId: string | null,
): Promise<DailyInventoryReportForDay | undefined> {
  try {
    return await getDailyInventoryReport(tenantId, dayKey, outletId)
  } catch (error) {
    console.error('[inventory] daily report read failed', { tenantId, dayKey, error })
    return undefined
  }
}

interface OpenCountState {
  openCountId: string | null
  openCountOutletId: string | null
  countProgress: CountSessionProgress | null
}

const NO_OPEN_COUNT: OpenCountState = { openCountId: null, openCountOutletId: null, countProgress: null }

/**
 * The count running on this shelf, if one is. A failure here costs the count
 * panel and nothing else: the merchant can still see their stock, record
 * deliveries, and read the report. The panel then offers to start a count,
 * which is the honest fallback — starting a second one joins the first anyway.
 */
async function readOpenCount(
  tenantId: string,
  scope: BranchScope,
  outletId: string | null,
): Promise<OpenCountState> {
  try {
    // A branch account still reads its own shelf's count. A store-wide account
    // reads ANY open count: it can now start one on a branch shelf, and a read
    // pinned to the store pool would report "no count running" while one is —
    // and offer to start a second.
    const openCount =
      scope.kind === 'all' ? await getAnyOpenCount(tenantId) : await getOpenCount(tenantId, outletId)
    if (!openCount) return NO_OPEN_COUNT
    return {
      openCountId: openCount.id,
      openCountOutletId: openCount.outletId,
      countProgress: await getCountProgress(tenantId, openCount.id),
    }
  } catch (error) {
    console.error('[inventory] count session read failed', { tenantId, error })
    return NO_OPEN_COUNT
  }
}

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

  // Quantities are read as whoever is looking: the owner's roll-up across every
  // branch, or one branch's own shelf. A manager shown the chain total would
  // count their shelf short against it.
  const scope = resolveBranchScope((await getCachedCurrentUserRole()) ?? { role: '' })

  // The report reconciles one Manila day: what the trade took off the shelf and
  // what it cost. Scoped to whoever is looking, matching the quantities above
  // it — a branch admin was previously shown every branch's movements
  // reconciled into one day and presented as their own.
  const { dayKey, latestDayKey } = resolveReportDay(day, new Date().toISOString())
  const reportScope = resolveReportScope({
    scope,
    orderBackend: tenant.order_backend ?? null,
    // The deployment's own bundle decides whether it can narrow the takings.
    // Sending the branch to an older one is not a degraded read — it is
    // rejected, and the screen says the store needs a backend update.
    convexSchemaVersion: tenant.convex_schema_version ?? null,
  })

  // ONE parallel batch. This page used to make ~16 round trips one after
  // another; none of these reads depends on another except the two that need
  // the ingredient list, and those chain off that one read inside the batch
  // rather than waiting for the whole batch to finish.
  const ingredientsRead = getScopedIngredients(tenant.id, scope)
  const outletsRead = readOutlets(tenant.id)

  const [
    units,
    ingredients,
    openAlerts,
    lastPurchaseByItemId,
    outlets,
    reconciliationIssues,
    { coverageRows, recipeComponents, menuItems, recipes, loadFailed },
    activity,
    branchStockByItemId,
    dailyReport,
    branchRevenue,
    openCount,
  ] = await Promise.all([
    // Seed the default unit catalog on first visit so ingredients always have
    // a unit to reference. Idempotent — existing units are returned untouched.
    seedDefaultUnits(tenant.id),
    ingredientsRead,
    // Open alerts need no feature-flag check of their own: when a tenant has
    // low-stock alerts switched off, nothing writes them, so the list is empty
    // and the banner renders nothing.
    getOpenStockAlerts(tenant.id),
    getCachedLastPurchaseDates(tenant.id),
    outletsRead,
    // Ledger self-check: does the store roll-up agree with the branch split the
    // trigger maintains? Store-wide accounts only — a branch manager's RLS view
    // of `inventory_stock` is partial, so their sums would cry drift that
    // isn't. Never throws; null (read failed) and [] (healthy) render nothing.
    scope.kind === 'all' ? getStockReconciliationIssues(tenant.id) : null,
    // Recipe coverage answers "which dishes are actually set up?" — the
    // question that had no surface at all, and the reason a tenant could switch
    // inventory on and have it quietly do nothing.
    getRecipeCoverage(tenant.id),
    // The Overview answers "what is this thing doing, and where can it not?"
    ingredientsRead.then((items) => getInventoryActivity(tenant.id, items)),
    // The owner's cross-branch view: which shop holds what, and which has run
    // out. Empty for a single-shop store, so the panel never appears for the
    // majority of tenants.
    Promise.all([ingredientsRead, outletsRead]).then(([items, rows]) =>
      getBranchStockSummaries(
        tenant.id,
        items.map((item) => item.id),
        activeBranchesOf(rows),
      ),
    ),
    readDailyReport(tenant.id, dayKey, reportScope.outletId),
    // Read alongside the report rather than after it; only shown when the
    // report itself was read (below).
    reportScope.isRevenueBranchScoped
      ? withOrderCredentials(tenant).then((withKeys) =>
          getDailyRevenue(withKeys, dayKey, {}, reportScope.outletId),
        )
      : undefined,
    readOpenCount(tenant.id, scope, reportScope.outletId),
  ])

  // Only a store-wide account chooses shelves; a branch account's movements are
  // pinned to its own branch server-side, so offering a selector would only
  // promise something `resolveMovementBranch` is going to refuse.
  const branches = scope.kind === 'all' ? activeBranchesOf(outlets) : []

  // The banner is scoped to match the quantities under it. `stock_alerts` rows
  // are raised store-wide and carry no branch, so a branch manager was shown
  // the chain's low-stock warnings sitting directly above their own branch's
  // figures — two numbers on one screen disagreeing about the same shelf.
  // A store-wide account passes its own roll-up in and keeps every alert.
  const alerts = scopeStockAlerts(openAlerts, ingredients)

  const autoHidden = explainAutoHiddenDishes(menuItems, recipes, recipeComponents, ingredients)
  const healthFlags: InventoryFlags = {
    lowStockAlertsEnabled: Boolean(tenant.low_stock_alerts_enabled),
    auto86Enabled: Boolean(tenant.auto_86_enabled),
  }
  const health = summarizeInventoryHealth({
    ingredients,
    coverage: coverageRows,
    autoHiddenCount: autoHidden.length,
    flags: healthFlags,
  })

  // The takings come from wherever this tenant's orders live, which is not
  // necessarily this database. `getDailyRevenue` never throws and returns null
  // when it cannot tell — the panel then omits the percentage and says why,
  // rather than dividing by a zero it invented.
  //
  // `undefined` rather than null when the takings cannot be narrowed to the
  // branch being shown: the panel omits the card entirely, which is honest,
  // where null would say "could not be read" and imply the figure would
  // otherwise have been theirs to see. See `resolveReportScope`.
  const dailyRevenue = dailyReport ? branchRevenue : null

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
      <StockReconciliationBanner issues={reconciliationIssues ?? []} />

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
        healthFlags={healthFlags}
        autoHidden={autoHidden}
        activity={activity.entries}
        activityLoadFailed={activity.loadFailed}
        dailyReport={dailyReport}
        dailyRevenue={dailyRevenue}
        latestDayKey={latestDayKey}
        defaultTab={tab}
        stockItemId={stock}
        stockReason={reason}
        openCountId={openCount.openCountId}
        countProgress={openCount.countProgress}
        openCountOutletId={openCount.openCountOutletId}
        branches={branches}
      />
    </div>
  )
}
