'use client'

import { Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { compatibleRecipeUnits } from '@/lib/inventory/recipe-line-rules'
import { cn } from '@/lib/utils'
import type { IngredientChoices, PanelUnit } from '@/components/admin/dish-recipe/types'

interface AddIngredientProps {
  choices: IngredientChoices
  /** Already on this list: not offered again. */
  takenIds: ReadonlySet<string>
  onPick: (ingredientId: string, stockUnitId: string) => void
  label?: string
  className?: string
}

/** "+ Add ingredient": a picker that resets after each pick. */
export function AddIngredient({ choices, takenIds, onPick, label = 'Add ingredient', className }: AddIngredientProps) {
  const offered = choices.ingredients.filter((ingredient) => !takenIds.has(ingredient.id))
  if (offered.length === 0) return null
  return (
    <Select
      value=""
      onValueChange={(id) => {
        const ingredient = choices.ingredientsById.get(id)
        if (ingredient) onPick(ingredient.id, ingredient.stock_unit_id)
      }}
    >
      <SelectTrigger
        aria-label={label}
        className={cn('h-9 w-auto gap-1.5 border-dashed text-muted-foreground max-sm:h-11', className)}
      >
        <Plus className="h-3.5 w-3.5" />
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {offered.map((ingredient) => (
          <SelectItem key={ingredient.id} value={ingredient.id}>{ingredient.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface UnitSelectProps {
  choices: IngredientChoices
  ingredientId: string
  unitId: string
  onChange: (unitId: string) => void
  ariaLabel: string
  className?: string
}

/** The units this ingredient can be measured in (weight ↔ volume included). */
export function UnitSelect({ choices, ingredientId, unitId, onChange, ariaLabel, className }: UnitSelectProps) {
  const stockUnitId = choices.ingredientsById.get(ingredientId)?.stock_unit_id ?? ''
  const fits: PanelUnit[] = compatibleRecipeUnits(stockUnitId, choices.units)
  // A stored unit that no longer converts is still shown, so the owner sees what to fix.
  const current = choices.unitsById.get(unitId)
  const options = current && !fits.some((unit) => unit.id === unitId) ? [current, ...fits] : fits
  return (
    <Select value={unitId || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn('h-9 w-20 max-sm:h-11', className)}>
        <SelectValue placeholder="Unit" />
      </SelectTrigger>
      <SelectContent>
        {options.map((unit) => (
          <SelectItem key={unit.id} value={unit.id}>{unit.abbreviation || unit.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
