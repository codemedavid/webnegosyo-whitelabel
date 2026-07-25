'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import {
  EMPTY_RECIPE_LINE,
  buildRecipeInput,
  recipeFormFromData,
  estimateRecipeCost,
  type RecipeFormState,
  type RecipeLineDraft,
} from '@/lib/inventory/recipe-form'
import {
  getIngredientsAction,
  getInventoryUnitsAction,
  getRecipeForTargetAction,
  saveRecipeForTargetAction,
  deleteRecipeForTargetAction,
} from '@/app/actions/inventory'

interface ModifierOptionRecipeEditorProps {
  tenantId: string
  tenantSlug: string
  menuItemId: string
  modifierOptionId: string
}

/**
 * Recipe-attach control shown inside a modifier option whose stock mode is
 * 'recipe'. Loads the tenant's ingredients/units and any existing recipe on
 * mount, edits component lines locally, and persists on its own server
 * round-trip (recipes live in the `recipes` table, not the item's group JSON).
 * Keyed by target `{ modifier_option, menuItemId, modifierOptionId }`.
 */
export function ModifierOptionRecipeEditor({
  tenantId,
  tenantSlug,
  menuItemId,
  modifierOptionId,
}: ModifierOptionRecipeEditorProps) {
  const [ingredients, setIngredients] = useState<InventoryItem[]>([])
  const [units, setUnits] = useState<InventoryUnitRow[]>([])
  const [form, setForm] = useState<RecipeFormState>({ notes: '', lines: [EMPTY_RECIPE_LINE] })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const target = {
    type: 'modifier_option' as const,
    menuItemId,
    modifierOptionId,
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const [ing, unit, recipe] = await Promise.all([
        getIngredientsAction(tenantId),
        getInventoryUnitsAction(tenantId),
        getRecipeForTargetAction(tenantId, target),
      ])
      if (!active) return
      if (ing.success) setIngredients(ing.data)
      if (unit.success) setUnits(unit.data)
      if (recipe.success) setForm(recipeFormFromData(recipe.data))
      setIsLoading(false)
    })()
    return () => {
      active = false
    }
    // Load once per option; target is derived from stable ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, menuItemId, modifierOptionId])

  const updateLine = (index: number, patch: Partial<RecipeLineDraft>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))
  }

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, EMPTY_RECIPE_LINE] }))

  const removeLine = (index: number) =>
    setForm((f) => {
      const next = f.lines.filter((_, i) => i !== index)
      return { ...f, lines: next.length > 0 ? next : [EMPTY_RECIPE_LINE] }
    })

  const handleSave = async () => {
    let input
    try {
      input = buildRecipeInput(form)
    } catch {
      toast.error('Each ingredient line needs an ingredient and a unit')
      return
    }

    setIsSaving(true)
    try {
      if (input.components.length === 0) {
        const result = await deleteRecipeForTargetAction(tenantId, tenantSlug, target)
        if (!result.success) {
          toast.error(result.error ?? 'Failed to clear recipe')
          return
        }
        toast.success('Recipe cleared')
        return
      }
      const result = await saveRecipeForTargetAction(tenantId, tenantSlug, target, input)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save recipe')
        return
      }
      toast.success('Recipe saved')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading recipe…
      </div>
    )
  }

  if (ingredients.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        No ingredients yet. Add ingredients in <span className="font-medium">Inventory</span> first,
        then attach them here.
      </p>
    )
  }

  const estimatedCost = estimateRecipeCost(form.lines, ingredients, units)

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Recipe (ingredients used per sale)</Label>
        {estimatedCost > 0 && (
          <span className="text-[11px] text-muted-foreground">
            Est. cost ₱{estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {form.lines.map((line, index) => (
          <div key={index} className="flex gap-2">
            <Select
              value={line.inventory_item_id || undefined}
              onValueChange={(value) => updateLine(index, { inventory_item_id: value })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Ingredient" />
              </SelectTrigger>
              <SelectContent>
                {ingredients.map((ingredient) => (
                  <SelectItem key={ingredient.id} value={ingredient.id}>
                    {ingredient.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="any"
              min={0}
              placeholder="Qty"
              value={line.quantity}
              onChange={(e) => updateLine(index, { quantity: e.target.value })}
              className="w-20"
            />
            <Select
              value={line.unit_id || undefined}
              onValueChange={(value) => updateLine(index, { unit_id: value })}
            >
              <SelectTrigger className="w-24">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.abbreviation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeLine(index)}
              className="text-red-500 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="mr-1 h-3 w-3" />
          Add ingredient
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save recipe'}
        </Button>
      </div>
    </div>
  )
}
