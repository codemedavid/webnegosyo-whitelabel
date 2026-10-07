'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { EMPTY_INGREDIENT_DRAFT, buildIngredientInput, ingredientToDraft, type IngredientDraft } from '@/lib/inventory/inventory-form'
import { createIngredientAction, updateIngredientAction } from '@/app/actions/inventory'

interface IngredientEditorDialogProps {
  tenantId: string
  tenantSlug: string
  item: InventoryItem | null
  units: InventoryUnitRow[]
  onSaved: (item: InventoryItem) => void
  onClose: () => void
}

/** Mounted per edit session, so typing never rerenders the ingredient table. */
export function IngredientEditorDialog({ tenantId, tenantSlug, item, units, onSaved, onClose }: IngredientEditorDialogProps) {
  // No router.refresh() after a save: the inventory actions revalidate, and a
  // revalidating Server Action already re-renders this route in its response.
  const editingId = item?.id ?? null
  const [draft, setDraft] = useState<IngredientDraft>(() => item
    ? ingredientToDraft(item)
    : { ...EMPTY_INGREDIENT_DRAFT, stock_unit_id: units[0]?.id ?? '' })
  const [isSaving, setIsSaving] = useState(false)

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
      onSaved(saved)
      toast.success(editingId ? 'Ingredient updated' : 'Ingredient added')
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
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
            onClick={() => onClose()}
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
  )
}
