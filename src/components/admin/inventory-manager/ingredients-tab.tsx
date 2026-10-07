'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ruler } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { InventoryHealthStrip, InventoryLogs } from '@/components/admin/inventory-overview'
import { InventoryTable } from '@/components/admin/inventory-table'
import { ImportWizard } from '@/components/admin/inventory-import/import-wizard'
import { useIngredientSpreadsheets } from '@/components/admin/inventory-import/use-ingredient-spreadsheets'
import { mergeImportedItems } from '@/lib/inventory/import/merge-items'
import { StockCountPanel } from '@/components/admin/stock-count-panel'
import { buildInventoryRows } from '@/lib/inventory/inventory-table'
import { deleteIngredientAction, previewIngredientDeleteAction } from '@/app/actions/inventory'
import {
  applyIngredientDeleteOutcome,
  describeIngredientDelete,
  describeIngredientDeleteOutcome,
} from '@/lib/inventory/ingredient-delete'
import { MANUAL_MOVEMENT_REASONS, type StockMovementReason } from '@/lib/inventory/stock-ledger'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import type { InventoryHealth } from '@/lib/inventory/inventory-health'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'
import type { AutoHiddenDish } from '@/lib/inventory/auto-86-blame'
import type { ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import type { CountSessionProgress } from '@/lib/inventory/count-session'
import type { SelectableBranch } from '@/lib/inventory/stock-outlet'
import { UnitsTab } from '@/components/admin/inventory-manager/units-tab'
import { IngredientEditorDialog } from '@/components/admin/inventory-manager/ingredient-editor-dialog'
import { StockMovementDialog } from '@/components/admin/inventory-manager/stock-movement-dialog'
import { describeActionError } from '@/components/admin/server-action-safety'

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

export function IngredientsTab({
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
  const [isImportOpen, setIsImportOpen] = useState(false)
  const spreadsheets = useIngredientSpreadsheets({ ingredients, units, storeName: tenantSlug })
  const [isOpen, setIsOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const [stockSelection, setStockSelection] = useState<{ item: InventoryItem; reason?: StockMovementReason } | null>(null)
  const openStock = useCallback((item: InventoryItem, reason?: StockMovementReason) => {
    setStockSelection({ item, reason })
  }, [])
  const unitsById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units])
  const ingredientsById = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients])

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
    const item = ingredientsById.get(stockItemId)
    if (!item) return
    setHandledDeepLink(stockItemId)
    openStock(item, isManualMovementReason(stockReason) ? stockReason : undefined)
  }, [stockItemId, stockReason, ingredientsById, handledDeepLink, openStock])

  const toggleRecipe = (itemId: string) =>
    setOpenRecipeId((current) => (current === itemId ? null : itemId))

  const openCreate = () => {
    setEditingItem(null)
    setIsOpen(true)
  }
  const openEdit = (item: InventoryItem) => {
    setEditingItem(item)
    setIsOpen(true)
  }

  /** The ingredient whose delete is being checked or written; a second tap waits. */
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (item: InventoryItem) => {
    if (deletingId) return
    setDeletingId(item.id)
    try {
      // Ask the database what a delete WOULD do before asking the merchant: an
      // ingredient in recipes loses those lines, and one with stock history is
      // kept as "Not in use" so the history survives. Never confirm blind.
      const preview = await previewIngredientDeleteAction(item.id, tenantId)
      if (!preview.success) {
        toast.error(preview.error ?? `We could not check ${item.name}. Try again in a moment.`)
        return
      }
      if (!confirm(describeIngredientDelete(item.name, preview.data))) return

      const result = await deleteIngredientAction(item.id, tenantId, tenantSlug)
      if (!result.success) {
        toast.error(result.error ?? `We could not delete ${item.name}. Try again in a moment.`)
        return
      }
      onChange(applyIngredientDeleteOutcome(ingredients, item.id, result.data.outcome))
      toast.success(describeIngredientDeleteOutcome(item.name, result.data))
    } catch (error) {
      // A dropped request or an expired session rejects; say so instead of
      // leaving the tap looking ignored.
      toast.error(describeActionError(error))
    } finally {
      setDeletingId(null)
    }
  }

  const noUnits = units.length === 0
  const recipeItem = ingredientsById.get(openRecipeId ?? '') ?? null

  const rows = useMemo(
    () =>
      buildInventoryRows(ingredients, {
        unitAbbreviation: (unitId) => unitsById.get(unitId)?.abbreviation ?? '',
        lastPurchaseAt: new Map(Object.entries(lastPurchaseByItemId)),
      }),
    [ingredients, unitsById, lastPurchaseByItemId],
  )

  // The table hands back an id; every door it opens needs the row itself.
  const withItem = (action: (item: InventoryItem) => void) => (id: string) => {
    const item = ingredientsById.get(id)
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
        onImport={() => setIsImportOpen(true)}
        onExport={spreadsheets.exportIngredients}
        onDownloadTemplate={spreadsheets.downloadTemplate}
      />

      <ImportWizard
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        tenantId={tenantId}
        storeName={tenantSlug}
        ingredients={ingredients}
        units={units}
        branches={branches}
        isTemplatePending={spreadsheets.pending === 'template'}
        onDownloadTemplate={spreadsheets.downloadTemplate}
        onImported={(saved) => {
          onChange(mergeImportedItems(ingredients, saved))
          router.refresh()
        }}
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

      {isOpen && (
        <IngredientEditorDialog
          key={editingItem?.id ?? 'new'}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          item={editingItem}
          units={units}
          onClose={() => setIsOpen(false)}
          onSaved={(saved) => onChange(editingItem
            ? ingredients.map((item) => item.id === editingItem.id ? saved : item)
            : [...ingredients, saved])}
        />
      )}
      {stockSelection && (
        <StockMovementDialog
          key={stockSelection.item.id}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          item={stockSelection.item}
          reason={stockSelection.reason}
          units={units}
          branches={branches}
          branchStockByItemId={branchStockByItemId}
          openCountId={openCountId}
          openCountOutletId={openCountOutletId}
          onClose={() => setStockSelection(null)}
          onSaved={(saved) => onChange(ingredients.map((item) => item.id === saved.id ? saved : item))}
        />
      )}
    </div>
  )
}

/** Narrows an untrusted URL value to a reason the merchant may actually pick. */
function isManualMovementReason(value: string | undefined): value is StockMovementReason {
  return (
    value !== undefined && (MANUAL_MOVEMENT_REASONS as readonly string[]).includes(value)
  )
}
