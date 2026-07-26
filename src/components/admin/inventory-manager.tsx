'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChefHat, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
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
import type { InventoryItem, InventoryUnitRow, InventoryUnitDimension } from '@/types/database'
import {
  EMPTY_STOCK_DRAFT,
  buildStockMovementInput,
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

/**
 * A reorder level of 0 means the merchant never set one — warning on it would
 * flag every ingredient the moment stock tracking is switched on.
 */
function isLowStock(item: InventoryItem): boolean {
  return item.reorder_level > 0 && item.current_qty <= item.reorder_level
}

interface InventoryManagerProps {
  tenantId: string
  tenantSlug: string
  initialIngredients: InventoryItem[]
  initialUnits: InventoryUnitRow[]
}

const DIMENSIONS: InventoryUnitDimension[] = ['weight', 'volume', 'count']

export function InventoryManager({
  tenantId,
  tenantSlug,
  initialIngredients,
  initialUnits,
}: InventoryManagerProps) {
  const [ingredients, setIngredients] = useState<InventoryItem[]>(initialIngredients)
  const [units, setUnits] = useState<InventoryUnitRow[]>(initialUnits)

  return (
    <Tabs defaultValue="ingredients">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
        <TabsTrigger value="units">Units</TabsTrigger>
      </TabsList>

      <TabsContent value="ingredients" className="pt-4">
        <IngredientsTab
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          ingredients={ingredients}
          units={units}
          onChange={setIngredients}
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
  onChange: (next: InventoryItem[]) => void
}

function IngredientsTab({ tenantId, tenantSlug, ingredients, units, onChange }: IngredientsTabProps) {
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={noUnits}>
          <Plus className="mr-2 h-4 w-4" />
          New Ingredient
        </Button>
      </div>

      {noUnits && (
        <p className="text-sm text-amber-600">
          Add at least one unit of measure first — ingredients are priced per unit.
        </p>
      )}

      {ingredients.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No ingredients yet. Add raw materials (flour, cheese) or prep items to build recipes and
            track cost.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {ingredients.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{item.name}</span>
                    {item.is_prep && <Badge variant="secondary">Prep</Badge>}
                    {!item.is_active && <Badge variant="outline">Inactive</Badge>}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    ₱{item.unit_cost.toFixed(2)} / {unitLabel(item.stock_unit_id)}
                    {item.category ? ` · ${item.category}` : ''}
                  </span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {formatQuantity(item.current_qty)} {unitLabel(item.stock_unit_id)} on hand
                    </span>
                    {isLowStock(item) && (
                      <Badge variant="destructive" className="text-[10px]">
                        Low stock
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openStock(item)}
                  >
                    <PackagePlus className="mr-1 h-3.5 w-3.5" />
                    Stock
                  </Button>
                  {item.is_prep && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleRecipe(item.id)}
                    >
                      <ChefHat className="mr-1 h-3.5 w-3.5" />
                      Recipe
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                </div>

                {/* Kept collapsed by default: each editor loads the tenant's
                    ingredients and its own recipe, so opening every prep at
                    once would fan out a request per row. */}
                {openRecipeId === item.id && (
                  <RecipeEditor
                    tenantId={tenantId}
                    tenantSlug={tenantSlug}
                    target={{ type: 'prep_item', prepItemId: item.id }}
                    label={`What ${item.name} is made of`}
                    onSaved={() => router.refresh()}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                  <Label>Unit</Label>
                  <Select
                    value={stockDraft.unit_id || undefined}
                    onValueChange={(value) => setStockDraft((d) => ({ ...d, unit_id: value }))}
                  >
                    <SelectTrigger>
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
                  <Label htmlFor="stock-cost">Unit cost (₱, optional)</Label>
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
                    already on hand.
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
