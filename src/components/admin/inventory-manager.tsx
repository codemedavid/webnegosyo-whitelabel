'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { RecipeWorkbench } from '@/components/admin/recipe-workbench'
import { InventoryHealthStrip, InventoryLogs } from '@/components/admin/inventory-overview'
import { DailyReportPanel } from '@/components/admin/daily-report-panel'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import type { InventoryHealth } from '@/lib/inventory/inventory-health'
import type { AutoHiddenDish } from '@/lib/inventory/auto-86-blame'
import type { ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import { cn } from '@/lib/utils'
import { StockHistoryList } from '@/components/admin/stock-history-list'
import { InventoryTable } from '@/components/admin/inventory-table'
import { StockCountPanel } from '@/components/admin/stock-count-panel'
import type { CountSessionProgress } from '@/lib/inventory/count-session'
import { buildInventoryRows } from '@/lib/inventory/inventory-table'
import type {
  InventoryItem,
  InventoryUnitRow,
  InventoryUnitDimension,
  RecipeComponent,
} from '@/types/database'
import {
  EMPTY_STOCK_DRAFT,
  buildStockMovementInput,
  describeDeliveryPriceUnit,
  type StockMovementDraft,
} from '@/lib/inventory/stock-form'
import {
  MANUAL_MOVEMENT_REASONS,
  MOVEMENT_ACTION_LABELS,
  MOVEMENT_REASON_LABELS,
  type StockMovementReason,
} from '@/lib/inventory/stock-ledger'
import {
  EMPTY_INGREDIENT_DRAFT,
  EMPTY_UNIT_DRAFT,
  buildIngredientInput,
  buildUnitInput,
  ingredientToDraft,
  unitToDraft,
  type IngredientDraft,
  type UnitDraft,
} from '@/lib/inventory/inventory-form'
import {
  createIngredientAction,
  updateIngredientAction,
  deleteIngredientAction,
  createInventoryUnitAction,
  updateInventoryUnitAction,
  deleteInventoryUnitAction,
  recordStockMovementAction,
  setBranchReorderLevelAction,
} from '@/app/actions/inventory'
import { BranchStockPanel } from '@/components/admin/branch-stock-panel'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'
import {
  resolveDefaultMovementOutlet,
  STORE_POOL_LABEL,
  type SelectableBranch,
} from '@/lib/inventory/stock-outlet'

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

/**
 * How long a stock movement may hang before we call it failed.
 *
 * The merchant is on mobile data in a kitchen. Without this the button reads
 * "Recording…" for as long as the network cares to stall, and the one thing
 * they cannot tell is whether the movement was saved.
 */
const RECORD_TIMEOUT_MS = 15_000

class TimeoutError extends Error {
  constructor() {
    super('timed out')
    this.name = 'TimeoutError'
  }
}

/**
 * Rejects when `promise` outruns `ms`.
 *
 * The request itself is not cancelled — a server action cannot be aborted from
 * here — so this reports a timeout without ever claiming the write was undone.
 * The copy says "nothing was saved" only for the cases where that is true, and
 * the refresh on reopen shows the merchant the authoritative figure either way.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

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

const DIMENSIONS: InventoryUnitDimension[] = ['weight', 'volume', 'count']

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
          health={health}
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

// ── Ingredients ──────────────────────────────────────────────────────────────

interface IngredientsTabProps {
  tenantId: string
  tenantSlug: string
  ingredients: InventoryItem[]
  units: InventoryUnitRow[]
  lastPurchaseByItemId: Record<string, string>
  /** Cross-branch view per ingredient. Empty for a single-shop store. */
  branchStockByItemId?: Record<string, BranchStockSummary>
  onChange: (next: InventoryItem[]) => void
  onUnitsChange: (next: InventoryUnitRow[]) => void
  /** Absent when the caller cannot summarise; the strip is then omitted. */
  health?: InventoryHealth
  autoHidden: AutoHiddenDish[]
  activity: ActivityFeedEntry[]
  activityLoadFailed: boolean
  stockItemId?: string
  stockReason?: string
  openCountId: string | null
  countProgress: CountSessionProgress | null
  openCountOutletId: string | null
  branches: SelectableBranch[]
}

function IngredientsTab({
  tenantId,
  tenantSlug,
  ingredients,
  units,
  lastPurchaseByItemId,
  branchStockByItemId,
  onChange,
  onUnitsChange,
  health,
  autoHidden,
  activity,
  activityLoadFailed,
  stockItemId,
  stockReason,
  openCountId,
  countProgress,
  openCountOutletId,
  branches,
}: IngredientsTabProps) {
  const router = useRouter()
  const [isUnitsOpen, setIsUnitsOpen] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<IngredientDraft>(EMPTY_INGREDIENT_DRAFT)
  const [isSaving, setIsSaving] = useState(false)
  // One prep's recipe open at a time — each editor is a separate data load.
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null)
  const [stockDraft, setStockDraft] = useState<StockMovementDraft>(EMPTY_STOCK_DRAFT)
  const [isRecording, setIsRecording] = useState(false)
  /**
   * Held in the dialog rather than thrown at a toast. A toast dismisses itself
   * while the merchant is looking at the pass, and the failure they never read
   * is the one that makes them record the delivery twice.
   */
  const [stockError, setStockError] = useState<string | null>(null)

  const openStock = useCallback(
    (item: InventoryItem, reason?: StockMovementReason) => {
      setStockItem(item)
      setStockError(null)
      // Default to the unit the ingredient is stocked in — the common case, and
      // the only one that needs no conversion.
      setStockDraft({
        ...EMPTY_STOCK_DRAFT,
        unit_id: item.stock_unit_id,
        // A single-branch tenant's every shelf IS its branch; the store pool
        // default would recreate the drift the selector exists to end.
        outlet_id: resolveDefaultMovementOutlet(branches),
        ...(reason ? { reason } : {}),
      })
    },
    [branches],
  )

  /*
    Arriving from the daily report. A merchant who was just told an ingredient
    came up short lands with that ingredient's dialog open and the movement set
    to a count — the accusation and the way to answer it are one step apart,
    not a name to memorise and a list to search.

    Runs once for the id the URL carried: reopening it on every render would
    make the dialog impossible to close.
  */
  const [handledDeepLink, setHandledDeepLink] = useState<string | null>(null)
  useEffect(() => {
    if (!stockItemId || handledDeepLink === stockItemId) return
    const item = ingredients.find((i) => i.id === stockItemId)
    if (!item) return
    setHandledDeepLink(stockItemId)
    openStock(item, isManualMovementReason(stockReason) ? stockReason : undefined)
  }, [stockItemId, stockReason, ingredients, handledDeepLink, openStock])

  const handleRecordStock = async () => {
    if (!stockItem) return
    let input
    try {
      // The open count is passed here rather than asked for on the form: a
      // merchant mid-count should not have to remember to tag each entry, and
      // `buildStockMovementInput` ignores it for every reason but `stocktake`.
      // The count's shelf comes too: a stocktake only files under the running
      // count when it is about the same shelf the count is.
      input = buildStockMovementInput(stockDraft, stockItem.id, openCountId, openCountOutletId)
    } catch (error) {
      setStockError(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setStockError(null)
    setIsRecording(true)
    try {
      const result = await withTimeout(
        recordStockMovementAction(tenantId, tenantSlug, input),
        RECORD_TIMEOUT_MS,
      )
      if (!result.success) {
        setStockError(result.error ?? 'Failed to record stock movement')
        return
      }
      // The server's figure replaces ours: a stale local total is exactly the
      // bug the ledger exists to prevent.
      const saved = result.data.item
      onChange(ingredients.map((i) => (i.id === saved.id ? saved : i)))
      // The merchant's question is "is the shelf figure right now?", and the
      // server's authoritative answer is already in hand. "Stock updated"
      // confirmed an event; this confirms the outcome.
      toast.success(
        `${saved.name} — ${formatQuantity(saved.current_qty)} ${unitLabel(saved.stock_unit_id)} on hand`,
      )
      setStockItem(null)
      router.refresh()
    } catch (error) {
      // A timeout or a dropped connection. The dialog stays open with what the
      // merchant typed still in it, so Record is a retry and not a re-entry.
      setStockError(
        error instanceof TimeoutError
          ? 'That took too long, so we stopped waiting. We cannot tell whether it saved — close this and check the on-hand figure before recording it again.'
          : 'We could not reach the server, so nothing was saved. Check your connection and try again.',
      )
    } finally {
      setIsRecording(false)
    }
  }

  const toggleRecipe = (itemId: string) =>
    setOpenRecipeId((current) => (current === itemId ? null : itemId))

  const unitLabel = (unitId: string) => {
    const unit = units.find((u) => u.id === unitId)
    return unit ? unit.abbreviation : '—'
  }

  const openCreate = () => {
    setEditingId(null)
    setDraft({ ...EMPTY_INGREDIENT_DRAFT, stock_unit_id: units[0]?.id ?? '' })
    setIsOpen(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id)
    setDraft(ingredientToDraft(item))
    setIsOpen(true)
  }

  const handleSave = async () => {
    let input
    try {
      input = buildIngredientInput(draft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setIsSaving(true)
    try {
      const result = editingId
        ? await updateIngredientAction(editingId, tenantId, tenantSlug, input)
        : await createIngredientAction(tenantId, tenantSlug, input)

      if (!result.success) {
        toast.error(result.error ?? 'We could not save this ingredient. Check the form and try again.')
        return
      }

      const saved = result.data
      onChange(
        editingId
          ? ingredients.map((i) => (i.id === editingId ? saved : i))
          : [...ingredients, saved],
      )
      toast.success(editingId ? 'Ingredient updated' : 'Ingredient added')
      setIsOpen(false)
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (item: InventoryItem) => {
    // Names the object and the consequence, and says what survives — the
    // history is what a merchant is most afraid of losing here.
    const confirmed = confirm(
      `Delete ${item.name}?\n\nAny recipe using it loses that line, and its cost changes. Past stock movements are kept.`,
    )
    if (!confirmed) return

    const result = await deleteIngredientAction(item.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? `We could not delete ${item.name}. Try again in a moment.`)
      return
    }
    onChange(ingredients.filter((i) => i.id !== item.id))
    toast.success('Ingredient deleted')
    router.refresh()
  }

  const noUnits = units.length === 0
  const recipeItem = ingredients.find((item) => item.id === openRecipeId) ?? null

  const rows = useMemo(
    () =>
      buildInventoryRows(ingredients, {
        unitAbbreviation: (unitId) => units.find((u) => u.id === unitId)?.abbreviation ?? '',
        lastPurchaseAt: new Map(Object.entries(lastPurchaseByItemId)),
      }),
    [ingredients, units, lastPurchaseByItemId],
  )

  // The table hands back an id; every door it opens needs the row itself.
  const withItem = (action: (item: InventoryItem) => void) => (id: string) => {
    const item = ingredients.find((i) => i.id === id)
    if (item) action(item)
  }

  return (
    <div className="space-y-6">
      {health && <InventoryHealthStrip health={health} />}

      {/* The warning names the control that fixes it. It used to imply a tab
          that no longer exists, which would have left the merchant hunting. */}
      {noUnits && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="flex-1 text-sm">
            Ingredients are priced per unit, so add a unit of measure before your first
            ingredient.
          </p>
          <Button
            type="button"
            variant="outline"
            className="max-sm:h-11 max-sm:w-full"
            onClick={() => setIsUnitsOpen(true)}
          >
            <Ruler className="mr-2 h-4 w-4" />
            Add a unit
          </Button>
        </div>
      )}

      {/*
        Above the table, because a count is a thing you do TO the shelf below —
        and because the warning about finishing early has to be read before the
        merchant reaches for the finish button, not after.
      */}
      <StockCountPanel
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        outletId={openCountId ? openCountOutletId : null}
        countId={openCountId}
        progress={countProgress}
        branches={branches}
      />

      <InventoryTable
        rows={rows}
        isCreateDisabled={noUnits}
        onCreate={openCreate}
        onEdit={withItem(openEdit)}
        onStock={withItem(openStock)}
        onRecipe={(id) => toggleRecipe(id)}
        onDelete={withItem(handleDelete)}
        onManageUnits={() => setIsUnitsOpen(true)}
      />

      <InventoryLogs
        autoHidden={autoHidden}
        activity={activity}
        activityLoadFailed={activityLoadFailed}
      />

      {/* Units are set up once and then never again, so they are reached from
          the list they serve rather than holding a tab beside the daily work. */}
      <Dialog open={isUnitsOpen} onOpenChange={setIsUnitsOpen}>
        <DialogContent className="max-h-[85dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>Units of measure</DialogTitle>
          </DialogHeader>
          <div className="-mx-6 overflow-y-auto px-6">
            <UnitsTab
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              units={units}
              onChange={onUnitsChange}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Loaded only once asked for: each editor reads the tenant's ingredients
          and its own recipe, so opening every prep at once would fan out a
          request per row. */}
      <Dialog open={recipeItem !== null} onOpenChange={(open) => !open && setOpenRecipeId(null)}>
        <DialogContent className="max-h-[85dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{recipeItem ? `Recipe — ${recipeItem.name}` : 'Recipe'}</DialogTitle>
          </DialogHeader>
          {recipeItem && (
            <RecipeEditor
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              target={{ type: 'prep_item', prepItemId: recipeItem.id }}
              label={`What ${recipeItem.name} is made of`}
              onSaved={() => router.refresh()}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Ingredient' : 'New Ingredient'}</DialogTitle>
          </DialogHeader>

          <div className="-mx-6 space-y-3 overflow-y-auto px-6">
            <div className="space-y-1">
              <Label htmlFor="ing-name">Name</Label>
              <Input
                id="ing-name"
                placeholder="e.g., Mozzarella"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ing-cost">Unit cost (₱)</Label>
                <Input
                  id="ing-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={draft.unit_cost}
                  onChange={(e) => setDraft((d) => ({ ...d, unit_cost: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Stock unit</Label>
                <Select
                  value={draft.stock_unit_id || undefined}
                  onValueChange={(value) => setDraft((d) => ({ ...d, stock_unit_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name} ({unit.abbreviation})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ing-sku">SKU (optional)</Label>
                <Input
                  id="ing-sku"
                  value={draft.sku}
                  onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ing-category">Category (optional)</Label>
                <Input
                  id="ing-category"
                  placeholder="e.g., Dairy"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ing-reorder">Reorder level</Label>
              <Input
                id="ing-reorder"
                type="number"
                min="0"
                placeholder="0"
                value={draft.reorder_level}
                onChange={(e) => setDraft((d) => ({ ...d, reorder_level: e.target.value }))}
              />
            </div>

            {/* The whole label is the target, so the tappable area is the row
                rather than the 16px box inside it. */}
            <div className="flex flex-wrap items-center gap-x-6 max-sm:gap-y-1">
              <label className="flex items-center gap-2 max-sm:min-h-11 max-sm:w-full">
                <input
                  type="checkbox"
                  checked={draft.is_prep}
                  onChange={(e) => setDraft((d) => ({ ...d, is_prep: e.target.checked }))}
                  className="h-4 w-4 max-sm:h-5 max-sm:w-5"
                />
                <span className="text-sm">
                  Prep item (made in-house)
                  <span className="block text-xs text-muted-foreground">
                    Gets its own recipe, so its cost comes from what goes into it.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 max-sm:min-h-11 max-sm:w-full">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
                  className="h-4 w-4 max-sm:h-5 max-sm:w-5"
                />
                <span className="text-sm">
                  In use
                  <span className="block text-xs text-muted-foreground">
                    Turn off to retire it without deleting its history.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="max-sm:h-11"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button className="max-sm:h-11" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Ingredient'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Bounded to the viewport with the body as the only scrolling part, so
        Record stays pinned in view. It used to sit under five inputs and a
        scrolling history list — on a phone the merchant had to scroll past
        their own entry to submit it.
      */}
      <Dialog open={stockItem !== null} onOpenChange={(open) => !open && setStockItem(null)}>
        <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{stockItem ? `Stock — ${stockItem.name}` : 'Stock'}</DialogTitle>
          </DialogHeader>

          {stockItem && (
            <div className="-mx-6 space-y-3 overflow-y-auto px-6">
              <p className="text-sm text-muted-foreground">
                {formatQuantity(stockItem.current_qty)} {unitLabel(stockItem.stock_unit_id)} on hand
              </p>

              {/*
                The figure above is the chain roll-up, which reads the same
                whether the stock is spread evenly or piled in one shop. This is
                where that difference becomes visible — and where the merchant is
                standing when they decide to move some.
              */}
              {branchStockByItemId?.[stockItem.id] && (
                <BranchStockPanel
                  summary={branchStockByItemId[stockItem.id]}
                  unitLabel={unitLabel(stockItem.stock_unit_id)}
                  transfersHref={`/${tenantSlug}/admin/inventory/transfers`}
                  storeReorderLevel={stockItem.reorder_level}
                  onSetReorderLevel={(outletId, reorderLevel) => {
                    // Fire-and-forget: the action revalidates the page, and a
                    // threshold is a setting rather than a quantity — nothing
                    // downstream is waiting on it the way a movement is.
                    void setBranchReorderLevelAction(
                      tenantId,
                      tenantSlug,
                      stockItem.id,
                      outletId,
                      reorderLevel,
                    )
                  }}
                />
              )}

              {/*
                Which shelf this movement touches. Only rendered for a store
                with branches — everyone else has one shelf, the store pool,
                and the dialog reads exactly as it always has. Order depletion
                already lands on the order's branch; without this the manual
                half of the ledger could only reach the pool.
              */}
              {branches.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="stock-outlet">
                    Applies to
                  </Label>
                  <Select
                    value={stockDraft.outlet_id ?? 'store-pool'}
                    onValueChange={(value) =>
                      setStockDraft((d) => ({
                        ...d,
                        outlet_id: value === 'store-pool' ? null : value,
                      }))
                    }
                  >
                    <SelectTrigger id="stock-outlet">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="store-pool">{STORE_POOL_LABEL}</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">What happened</Label>
                <div className="flex flex-wrap gap-1">
                  {MANUAL_MOVEMENT_REASONS.map((reason) => (
                    <Button
                      key={reason}
                      type="button"
                      size="sm"
                      className="max-sm:h-11 max-sm:flex-1"
                      variant={stockDraft.reason === reason ? 'default' : 'outline'}
                      aria-pressed={stockDraft.reason === reason}
                      onClick={() => setStockDraft((d) => ({ ...d, reason }))}
                    >
                      {MOVEMENT_REASON_LABELS[reason]}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{reasonHint(stockDraft.reason)}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="stock-qty">Quantity</Label>
                  <Input
                    id="stock-qty"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={stockDraft.quantity}
                    onChange={(e) => setStockDraft((d) => ({ ...d, quantity: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="stock-unit">Unit</Label>
                  <Select
                    value={stockDraft.unit_id || undefined}
                    onValueChange={(value) => setStockDraft((d) => ({ ...d, unit_id: value }))}
                  >
                    <SelectTrigger id="stock-unit">
                      <SelectValue placeholder="Select a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.abbreviation}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {stockDraft.reason === 'receive' && (
                <div className="space-y-1">
                  {/*
                    The price is per the unit the merchant is entering in, and the
                    server converts it to the stock unit. Naming both is the whole
                    point: "Unit cost" beside a unit dropdown reads as either one,
                    and guessing wrong is a 1000x error the merchant cannot see
                    from this screen.
                  */}
                  <Label htmlFor="stock-cost">
                    {describeDeliveryPriceUnit(stockDraft.unit_id, stockItem.stock_unit_id, unitLabel)
                      .label}
                  </Label>
                  <Input
                    id="stock-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={stockItem.unit_cost.toFixed(2)}
                    value={stockDraft.unit_cost}
                    onChange={(e) => setStockDraft((d) => ({ ...d, unit_cost: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to keep the current cost. A price here is blended with the stock
                    already on hand.{' '}
                    {describeDeliveryPriceUnit(
                      stockDraft.unit_id,
                      stockItem.stock_unit_id,
                      unitLabel,
                    ).conversionHint ?? ''}
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="stock-note">Note (optional)</Label>
                <Input
                  id="stock-note"
                  placeholder="e.g., delivery #1042"
                  value={stockDraft.note}
                  onChange={(e) => setStockDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </div>

              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium">Recent movements</p>
                <StockHistoryList tenantId={tenantId} item={stockItem} units={units} />
              </div>
            </div>
          )}

          {stockError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {stockError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="max-sm:h-11"
              onClick={() => setStockItem(null)}
            >
              Cancel
            </Button>
            <Button className="max-sm:h-11" onClick={handleRecordStock} disabled={isRecording}>
              {isRecording ? 'Recording…' : MOVEMENT_ACTION_LABELS[stockDraft.reason]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Narrows an untrusted URL value to a reason the merchant may actually pick. */
function isManualMovementReason(value: string | undefined): value is StockMovementReason {
  return (
    value !== undefined && (MANUAL_MOVEMENT_REASONS as readonly string[]).includes(value)
  )
}

/**
 * Explains what the quantity means, and what it will do to the shelf figure.
 *
 * The three movements do three different things to the total — one adds, one
 * subtracts, one replaces — and that is the part a merchant cannot see from
 * the field itself.
 */
function reasonHint(reason: StockMovementReason): string {
  if (reason === 'stocktake') return 'What you actually counted. This replaces the figure on hand.'
  if (reason === 'waste') return 'How much was thrown away. This comes off the figure on hand.'
  return 'How much arrived. This is added to the figure on hand.'
}

// ── Units ────────────────────────────────────────────────────────────────────

interface UnitsTabProps {
  tenantId: string
  tenantSlug: string
  units: InventoryUnitRow[]
  onChange: (next: InventoryUnitRow[]) => void
}

function UnitsTab({ tenantId, tenantSlug, units, onChange }: UnitsTabProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_UNIT_DRAFT)
  const [isSaving, setIsSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_UNIT_DRAFT)
    setIsOpen(true)
  }

  const openEdit = (unit: InventoryUnitRow) => {
    setEditingId(unit.id)
    setDraft(unitToDraft(unit))
    setIsOpen(true)
  }

  const handleSave = async () => {
    let input
    try {
      input = buildUnitInput(draft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setIsSaving(true)
    try {
      const result = editingId
        ? await updateInventoryUnitAction(editingId, tenantId, tenantSlug, input)
        : await createInventoryUnitAction(tenantId, tenantSlug, input)

      if (!result.success) {
        toast.error(result.error ?? 'We could not save this unit. Check the form and try again.')
        return
      }

      const saved = result.data
      onChange(
        editingId
          ? units.map((u) => (u.id === editingId ? saved : u))
          : [...units, saved],
      )
      toast.success(editingId ? 'Unit updated' : 'Unit added')
      setIsOpen(false)
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (unit: InventoryUnitRow) => {
    if (
      !confirm(
        `Delete ${unit.name}?\n\nAny ingredient measured in it needs a new unit before you can record stock against it.`,
      )
    )
      return
    const result = await deleteInventoryUnitAction(unit.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? `We could not delete ${unit.name}. Try again in a moment.`)
      return
    }
    onChange(units.filter((u) => u.id !== unit.id))
    toast.success('Unit deleted')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="max-sm:h-11 max-sm:w-full" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Unit
        </Button>
      </div>

      {units.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No units yet. Grams, millilitres, pieces — recipes use them to turn a quantity into a
          cost.
        </p>
      ) : (
        /*
          The same row grammar as an ingredient: name leads, a meta line sits
          under it, actions cluster right. A plain bordered row rather than a
          Card, because this list now lives inside a dialog and a card inside a
          card is never the answer.
        */
        <ul className="divide-y rounded-xl border">
          {units.map((unit) => (
            <li key={unit.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">
                    {unit.name} ({unit.abbreviation})
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {unit.dimension}
                  </Badge>
                  {unit.is_base && <Badge variant="secondary">Base</Badge>}
                </div>
                <span className="text-sm text-muted-foreground">
                  1 {unit.abbreviation} = {unit.to_base_factor} base
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="max-sm:h-11"
                  onClick={() => openEdit(unit)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive max-sm:size-11"
                  aria-label={`Delete ${unit.name}`}
                  onClick={() => handleDelete(unit)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Unit' : 'New Unit'}</DialogTitle>
          </DialogHeader>

          <div className="-mx-6 space-y-3 overflow-y-auto px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="unit-name">Name</Label>
                <Input
                  id="unit-name"
                  placeholder="e.g., Gram"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="unit-abbr">Abbreviation</Label>
                <Input
                  id="unit-abbr"
                  placeholder="e.g., g"
                  value={draft.abbreviation}
                  onChange={(e) => setDraft((d) => ({ ...d, abbreviation: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Dimension</Label>
                <Select
                  value={draft.dimension}
                  onValueChange={(value) =>
                    setDraft((d) => ({ ...d, dimension: value as InventoryUnitDimension }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIMENSIONS.map((dim) => (
                      <SelectItem key={dim} value={dim} className="capitalize">
                        {dim}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="unit-factor">Conversion to base</Label>
                <Input
                  id="unit-factor"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="1"
                  value={draft.to_base_factor}
                  onChange={(e) => setDraft((d) => ({ ...d, to_base_factor: e.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 max-sm:min-h-11">
              <input
                type="checkbox"
                checked={draft.is_base}
                onChange={(e) => setDraft((d) => ({ ...d, is_base: e.target.checked }))}
                className="h-4 w-4 max-sm:h-5 max-sm:w-5"
              />
              <span className="text-sm">Base unit for its dimension</span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="max-sm:h-11"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button className="max-sm:h-11" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
