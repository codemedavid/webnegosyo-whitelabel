'use client'

import { useState } from 'react'
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
import type { InventoryItem, InventoryUnitRow, InventoryUnitDimension } from '@/types/database'
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
} from '@/app/actions/inventory'

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
              <CardContent className="flex items-center justify-between gap-3 py-3">
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
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(item)}>
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
    </div>
  )
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
