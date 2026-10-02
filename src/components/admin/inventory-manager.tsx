'use client'

import { useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RecipeWorkbench } from '@/components/admin/recipe-workbench'
import { DailyReportPanel } from '@/components/admin/daily-report-panel'
import { IngredientsTab } from '@/components/admin/inventory-manager/ingredients-tab'
import { summarizeInventoryHealth, type InventoryFlags, type InventoryHealth } from '@/lib/inventory/inventory-health'
import { cn } from '@/lib/utils'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import type { AutoHiddenDish } from '@/lib/inventory/auto-86-blame'
import type { ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import type { CountSessionProgress } from '@/lib/inventory/count-session'
import type { InventoryItem, InventoryUnitRow, RecipeComponent } from '@/types/database'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'
import type { SelectableBranch } from '@/lib/inventory/stock-outlet'

interface InventoryManagerProps {
  tenantId: string
  tenantSlug: string
  initialIngredients: InventoryItem[]
  initialUnits: InventoryUnitRow[]
  /**
   * Most recent `receive` per ingredient, as a plain record — a Map would have
   * to survive the server-to-client boundary for no gain.
   */
  lastPurchaseByItemId?: Record<string, string>
  /**
   * The cross-branch view per ingredient — which shop holds what, and which has
   * run out. A plain record for the same reason as `lastPurchaseByItemId`: it
   * crosses the server boundary and a Map would be rebuilt here for no gain.
   * Absent or empty for a single-shop store, whose panel renders nothing.
   */
  branchStockByItemId?: Record<string, BranchStockSummary>
  /**
   * Recipe coverage is computed on the server, where the menu items and recipes
   * are already being read. Passing the finished rows keeps this component from
   * fetching a second time just to answer "which dishes are set up?".
   */
  coverageRows?: RecipeCoverageRow[]
  recipeComponents?: RecipeComponent[]
  /** The coverage read failed, so an empty list must not read as an empty menu. */
  coverageLoadFailed?: boolean
  /**
   * Everything the Overview tab needs, computed on the server from reads the
   * page already makes. Optional so the surface degrades to the previous three
   * tabs rather than crashing if a caller has not been updated.
   */
  health?: InventoryHealth
  /**
   * The tenant flags the verdict depends on. With these the strip is
   * re-summarised from the ingredient list on screen, so a row the merchant
   * just added counts immediately instead of waiting for the server figure —
   * the table said "1 ingredient" under a strip still saying "No ingredients
   * yet". Without them the server's `health` is shown as given.
   */
  healthFlags?: InventoryFlags
  autoHidden?: AutoHiddenDish[]
  activity?: ActivityFeedEntry[]
  /** The ledger read failed — distinct from a quiet day with nothing in it. */
  activityLoadFailed?: boolean
  /**
   * One reconciled Manila day. Optional so the surface degrades to the tabs
   * that were always here rather than showing an empty Reports tab, which
   * would read as a day with no trade.
   */
  dailyReport?: DailyInventoryReportForDay
  /**
   * The same day's takings, for the food cost percentage. `null` means the
   * tenant's order backend could not be read — distinct from absent, which
   * means this caller does not supply revenue at all.
   */
  dailyRevenue?: number | null
  /** Today, in Manila. Passed in so the render stays deterministic. */
  latestDayKey?: string
  /**
   * The stock count running on this shelf, if one is. Both are needed: the id
   * is what a stocktake is filed under, and the progress is what the panel
   * shows. Absent means no count is running, NOT an abandoned one.
   */
  openCountId?: string | null
  countProgress?: CountSessionProgress | null
  /**
   * The shelf the running count is about. Meaningless without `openCountId`;
   * `null` with one means the store pool, which is what every count was before
   * branches could be counted.
   */
  openCountOutletId?: string | null
  /**
   * This tenant's active branches. Empty for a single-shop store, whose stock
   * dialog and count panel then look exactly as they always have. With
   * branches, every receive/waste/stocktake names the shelf it lands on —
   * order depletion already writes to the order's branch, and a dialog that
   * could only reach the store pool drifted the two apart.
   */
  branches?: SelectableBranch[]
  /** Which tab the URL asked for; an unknown value falls back to the default. */
  defaultTab?: string
  /**
   * An ingredient the URL asked to open the stock dialog for, with the movement
   * already chosen. The daily report links here when a row came up short, so a
   * merchant told "something is missing" lands on the control that answers it.
   */
  stockItemId?: string
  stockReason?: string
}

/**
 * Literal class names, because Tailwind cannot see an interpolated one.
 *
 * Two or three tabs now: what do I have, what is a dish made of, and what did
 * yesterday cost. Overview folded into the first because its figures describe
 * the list underneath them, and Units moved behind a button because it is
 * configured once and then never again.
 */
const TAB_GRID_COLUMNS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
}

export function InventoryManager({
  tenantId,
  tenantSlug,
  initialIngredients,
  initialUnits,
  lastPurchaseByItemId = {},
  branchStockByItemId = {},
  coverageRows = [],
  recipeComponents = [],
  coverageLoadFailed = false,
  health,
  healthFlags,
  autoHidden = [],
  activity = [],
  activityLoadFailed = false,
  dailyReport,
  dailyRevenue,
  latestDayKey,
  openCountId = null,
  countProgress = null,
  openCountOutletId = null,
  branches = [],
  defaultTab,
  stockItemId,
  stockReason,
}: InventoryManagerProps) {
  const [ingredients, setIngredients] = useState<InventoryItem[]>(initialIngredients)
  const [units, setUnits] = useState<InventoryUnitRow[]>(initialUnits)

  const canShowReport = Boolean(dailyReport && latestDayKey)

  // One list feeds both the table and the strip above it, so they cannot
  // disagree about how many ingredients exist. Falls back to the server's
  // figure when the flags it needs were not supplied.
  const liveHealth = useMemo(() => {
    if (!healthFlags) return health
    return summarizeInventoryHealth({
      ingredients,
      coverage: coverageRows,
      autoHiddenCount: autoHidden.length,
      flags: healthFlags,
    })
  }, [health, healthFlags, ingredients, coverageRows, autoHidden.length])

  // An EMPTY coverage list means the caller could not say what is set up — not
  // that nothing is. Passing 0 there would let a missing prop masquerade as the
  // finding "no dish has a recipe", so the verdict is withheld instead.
  const dishesWithRecipe =
    coverageRows.length > 0 ? coverageRows.filter((row) => row.hasRecipe).length : undefined

  // Ingredients leads: "what do I have?" is the question a merchant arrives
  // with, and it is the surface they touch many times a day. The URL can
  // override it, because the report's day links carry their tab — without that,
  // stepping a day would land back here and read as a broken link. An unknown
  // tab (including the retired `overview` and `units`) falls back rather than
  // opening nothing.
  const availableTabs = ['ingredients', 'recipes', ...(canShowReport ? ['reports'] : [])]
  const initialTab =
    defaultTab && availableTabs.includes(defaultTab) ? defaultTab : 'ingredients'

  return (
    <Tabs defaultValue={initialTab}>
      {/*
        The column count is looked up, never interpolated — Tailwind scans for
        literal class names, so a `grid-cols-${n}` template compiles to nothing
        and the tabs stack.
      */}
      {/* The negative margin lets the strip scroll edge to edge on a phone
          while the page keeps its gutter. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <TabsList
          className={cn(
            'max-sm:h-12 max-sm:w-max sm:grid sm:w-full sm:max-w-xl',
            TAB_GRID_COLUMNS[availableTabs.length],
          )}
        >
          <TabsTrigger className="max-sm:px-4" value="ingredients">
            Ingredients
          </TabsTrigger>
          <TabsTrigger className="max-sm:px-4" value="recipes">
            Recipes
          </TabsTrigger>
          {canShowReport && (
            <TabsTrigger className="max-sm:px-4" value="reports">
              Reports
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      <TabsContent value="ingredients" className="pt-4">
        <IngredientsTab
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          ingredients={ingredients}
          units={units}
          lastPurchaseByItemId={lastPurchaseByItemId}
          branchStockByItemId={branchStockByItemId}
          onChange={setIngredients}
          onUnitsChange={setUnits}
          health={liveHealth}
          autoHidden={autoHidden}
          activity={activity}
          activityLoadFailed={activityLoadFailed}
          stockItemId={stockItemId}
          stockReason={stockReason}
          openCountId={openCountId}
          countProgress={countProgress}
          openCountOutletId={openCountOutletId}
          branches={branches}
        />
      </TabsContent>

      <TabsContent value="recipes" className="pt-4">
        <RecipeWorkbench
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          rows={coverageRows}
          ingredients={ingredients}
          components={recipeComponents}
          loadFailed={coverageLoadFailed}
        />
      </TabsContent>

      {dailyReport && latestDayKey && (
        <TabsContent value="reports" className="pt-4">
          <DailyReportPanel
            tenantSlug={tenantSlug}
            report={dailyReport}
            revenue={dailyRevenue}
            dishesWithRecipe={dishesWithRecipe}
            latestDayKey={latestDayKey}
          />
        </TabsContent>
      )}
    </Tabs>
  )
}
