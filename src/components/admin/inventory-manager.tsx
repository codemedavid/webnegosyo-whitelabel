'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
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
import { InventoryOverview } from '@/components/admin/inventory-overview'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import type { InventoryHealth } from '@/lib/inventory/inventory-health'
import type { AutoHiddenDish } from '@/lib/inventory/auto-86-blame'
import type { ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import { cn } from '@/lib/utils'
import { StockHistoryList } from '@/components/admin/stock-history-list'
import { InventoryTable } from '@/components/admin/inventory-table'
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
} from '@/app/actions/inventory'

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
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
}

const DIMENSIONS: InventoryUnitDimension[] = ['weight', 'volume', 'count']

export function InventoryManager({
  tenantId,
  tenantSlug,
  initialIngredients,
  initialUnits,
  lastPurchaseByItemId = {},
  coverageRows = [],
  recipeComponents = [],
  coverageLoadFailed = false,
  health,
  autoHidden = [],
  activity = [],
  activityLoadFailed = false,
}: InventoryManagerProps) {
  const [ingredients, setIngredients] = useState<InventoryItem[]>(initialIngredients)
  const [units, setUnits] = useState<InventoryUnitRow[]>(initialUnits)

  return (
    // Overview leads, and is the default: "what is happening?" is the question a
    // merchant arrives with, and it was the one tab the page did not have.
    <Tabs defaultValue={health ? 'overview' : 'ingredients'}>
      <TabsList className={cn('grid w-full max-w-md', health ? 'grid-cols-4' : 'grid-cols-3')}>
        {health && <TabsTrigger value="overview">Overview</TabsTrigger>}
        <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
        <TabsTrigger value="recipes">Recipes</TabsTrigger>
        <TabsTrigger value="units">Units</TabsTrigger>
      </TabsList>

      {health && (
        <TabsContent value="overview" className="pt-4">
          <InventoryOverview
            health={health}
            autoHidden={autoHidden}
            activity={activity}
            activityLoadFailed={activityLoadFailed}
          />
        </TabsContent>
      )}

      <TabsContent value="ingredients" className="pt-4">
        <IngredientsTab
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          ingredients={ingredients}
          units={units}
          lastPurchaseByItemId={lastPurchaseByItemId}
          onChange={setIngredients}
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

      <TabsContent value="units" className="pt-4">
        <UnitsTab
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          units={units}
          onChange={setUnits}
        />
      </TabsContent>
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
  onChange: (next: InventoryItem[]) => void
}

function IngredientsTab({
  tenantId,
  tenantSlug,
  ingredients,
  units,
  lastPurchaseByItemId,
  onChange,
}: IngredientsTabProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<IngredientDraft>(EMPTY_INGREDIENT_DRAFT)
  const [isSaving, setIsSaving] = useState(false)
  // One prep's recipe open at a time — each editor is a separate data load.
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null)
  const [stockDraft, setStockDraft] = useState<StockMovementDraft>(EMPTY_STOCK_DRAFT)
  const [isRecording, setIsRecording] = useState(false)

  const openStock = (item: InventoryItem) => {
    setStockItem(item)
    // Default to the unit the ingredient is stocked in — the common case, and
    // the only one that needs no conversion.
    setStockDraft({ ...EMPTY_STOCK_DRAFT, unit_id: item.stock_unit_id })
  }

  const handleRecordStock = async () => {
    if (!stockItem) return
    let input
    try {
      input = buildStockMovementInput(stockDraft, stockItem.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setIsRecording(true)
    try {
      const result = await recordStockMovementAction(tenantId, tenantSlug, input)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to record stock movement')
        return
      }
      // The server's figure replaces ours: a stale local total is exactly the
      // bug the ledger exists to prevent.
      const saved = result.data.item
      onChange(ingredients.map((i) => (i.id === saved.id ? saved : i)))
      toast.success('Stock updated')
      setStockItem(null)
      router.refresh()
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
        toast.error(result.error ?? 'Failed to save ingredient')
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
    if (!confirm(`Delete "${item.name}"? Recipes using it will lose this line.`)) return
    const result = await deleteIngredientAction(item.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete ingredient')
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
    <div className="space-y-4">
      {noUnits && (
        <p className="text-sm text-amber-600">
          Add at least one unit of measure first — ingredients are priced per unit.
        </p>
      )}

      <InventoryTable
        rows={rows}
        isCreateDisabled={noUnits}
        onCreate={openCreate}
        onEdit={withItem(openEdit)}
        onStock={withItem(openStock)}
        onRecipe={(id) => toggleRecipe(id)}
        onDelete={withItem(handleDelete)}
      />

      {/* Loaded only once asked for: each editor reads the tenant's ingredients
          and its own recipe, so opening every prep at once would fan out a
          request per row. */}
      <Dialog open={recipeItem !== null} onOpenChange={(open) => !open && setOpenRecipeId(null)}>
        <DialogContent className="max-w-2xl">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Ingredient' : 'New Ingredient'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
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

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.is_prep}
                  onChange={(e) => setDraft((d) => ({ ...d, is_prep: e.target.checked }))}
                  className="h-4 w-4"
                />
                <span className="text-sm">Prep item (made in-house)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
                  className="h-4 w-4"
                />
                <span className="text-sm">Active</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Ingredient'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stockItem !== null} onOpenChange={(open) => !open && setStockItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stockItem ? `Stock — ${stockItem.name}` : 'Stock'}</DialogTitle>
          </DialogHeader>

          {stockItem && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {formatQuantity(stockItem.current_qty)} {unitLabel(stockItem.stock_unit_id)} on hand
              </p>

              <div className="space-y-1">
                <Label className="text-xs">What happened</Label>
                <div className="flex gap-1">
                  {MANUAL_MOVEMENT_REASONS.map((reason) => (
                    <Button
                      key={reason}
                      type="button"
                      size="sm"
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setStockItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleRecordStock} disabled={isRecording}>
              {isRecording ? 'Recording...' : 'Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Explains what the quantity field means for the chosen reason. */
function reasonHint(reason: StockMovementReason): string {
  if (reason === 'stocktake') return 'Enter the amount you actually counted.'
  if (reason === 'waste') return 'Enter how much was thrown away.'
  return 'Enter how much arrived.'
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
        toast.error(result.error ?? 'Failed to save unit')
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
    if (!confirm(`Delete "${unit.name}"? Ingredients using it must be reassigned.`)) return
    const result = await deleteInventoryUnitAction(unit.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete unit')
      return
    }
    onChange(units.filter((u) => u.id !== unit.id))
    toast.success('Unit deleted')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Unit
        </Button>
      </div>

      {units.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No units yet. Units of measure (grams, ml, pieces) let recipes convert ingredient
            quantities to cost.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {units.map((unit) => (
            <Card key={unit.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
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
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(unit)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(unit)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Unit' : 'New Unit'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
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

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_base}
                onChange={(e) => setDraft((d) => ({ ...d, is_base: e.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-sm">Base unit for its dimension</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
