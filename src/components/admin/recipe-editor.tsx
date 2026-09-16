'use client'

import { useEffect, useRef, useState } from 'react'
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
import type { RecipeTarget } from '@/lib/inventory/recipe-target'
import type { RecipeWithComponents } from '@/lib/inventory/recipes-service'
import {
  createEmptyRecipeLine,
  buildRecipeInput,
  recipeFormFromData,
  estimateRecipeCost,
  type RecipeFormState,
  type RecipeLineDraft,
} from '@/lib/inventory/recipe-form'

interface RecipeEditorProps {
  tenantId: string
  tenantSlug: string
  /** Which costable target this recipe belongs to. */
  target: RecipeTarget
  /** Heading above the ingredient lines. */
  label?: string
  /** Fired after a successful save or clear, so a cost display can refresh. */
  onSaved?: () => void
  /** Lets a containing picker or dialog hold navigation while a write finishes. */
  onSavingChange?: (isSaving: boolean) => void
}

const DEFAULT_LABEL = 'Recipe (ingredients used per sale)'

interface RecipeEditorSnapshot {
  ingredients: InventoryItem[]
  units: InventoryUnitRow[]
  recipe: RecipeWithComponents | null
}

/**
 * Attach an inventory recipe to any costable target: the base menu item, a
 * variation option, an addon, or a unified modifier option.
 *
 * Loads the tenant's ingredients/units and any existing recipe on mount, edits
 * component lines locally, and persists on its own server round-trip — recipes
 * live in the `recipes` table, not in the item's JSON columns. All target
 * specifics are carried by `target`, so the same control serves every target
 * and no call site can key a recipe incorrectly (see `recipe-target.ts`).
 */
export function RecipeEditor({
  tenantId,
  tenantSlug,
  target,
  label,
  onSaved,
  onSavingChange,
}: RecipeEditorProps) {
  const [ingredients, setIngredients] = useState<InventoryItem[]>([])
  const [units, setUnits] = useState<InventoryUnitRow[]>([])
  const [form, setForm] = useState<RecipeFormState>({ notes: '', lines: [createEmptyRecipeLine()] })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const mountedRef = useRef(true)
  const latestWriteRef = useRef(0)

  // Serialized so the effect re-runs when the target changes identity but not
  // on every parent render (the descriptor is usually an inline object).
  const targetKey = JSON.stringify(target)
  const targetKeyRef = useRef(targetKey)
  targetKeyRef.current = targetKey

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Only a prep is *produced*; everything else is consumed per sale, where a
  // yield is meaningless and would only invite a wrong number.
  const isPrep = target.type === 'prep_item'
  const yieldFieldId = `recipe-yield-${isPrep ? target.prepItemId : 'none'}`

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const currentTarget: RecipeTarget = JSON.parse(targetKey)
    setIsLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const search = new URLSearchParams({ tenantId, target: targetKey })
        const response = await fetch(`/api/inventory/recipe?${search}`, {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const payload = await response.json() as {
          data?: RecipeEditorSnapshot
          error?: string
        }
        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? 'Failed to load recipe')
        }
        if (!active) return

        const { ingredients: loadedIngredients, units: loadedUnits, recipe } = payload.data
        setIngredients(loadedIngredients)
        setUnits(loadedUnits)
        const loaded = recipeFormFromData(recipe)
        // A prep is priced per its stock unit, so that is the unit a merchant
        // almost always means by "yields". Pre-selecting it saves a step and
        // avoids a yield saved in a unit nobody intended.
        const defaultYieldUnit =
          currentTarget.type === 'prep_item'
            ? loadedIngredients.find((i) => i.id === currentTarget.prepItemId)?.stock_unit_id
            : undefined
        setForm({ ...loaded, yieldUnitId: loaded.yieldUnitId || defaultYieldUnit || '' })
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return
        setLoadError(error instanceof Error ? error.message : 'Failed to load recipe')
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [tenantId, targetKey])

  const updateLine = (index: number, patch: Partial<RecipeLineDraft>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))
  }

  const addLine = () =>
    setForm((f) => ({ ...f, lines: [...f.lines, createEmptyRecipeLine()] }))

  const removeLine = (index: number) =>
    setForm((f) => {
      const next = f.lines.filter((_, i) => i !== index)
      return { ...f, lines: next.length > 0 ? next : [createEmptyRecipeLine()] }
    })

  const handleSave = async () => {
    let input
    try {
      input = buildRecipeInput(form)
    } catch {
      toast.error('Each ingredient line needs an ingredient and a unit')
      return
    }

    const writeId = ++latestWriteRef.current
    const writtenTargetKey = targetKey
    const isCurrentWrite = () =>
      mountedRef.current &&
      latestWriteRef.current === writeId &&
      targetKeyRef.current === writtenTargetKey

    setIsSaving(true)
    onSavingChange?.(true)
    try {
      // An emptied form means "this target has no recipe" — deleting is the
      // only way to say that; an empty recipe row would cost a confident ₱0.
      const clearsRecipe = input.components.length === 0
      const response = await fetch('/api/inventory/recipe', {
        method: clearsRecipe ? 'DELETE' : 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          tenantSlug,
          target,
          ...(clearsRecipe ? {} : { input }),
        }),
        // Recipe payloads are small. Keeping the request alive makes a full
        // page navigation safe as well as an in-app route change.
        keepalive: true,
      })
      const result = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !result.success) {
        if (isCurrentWrite()) {
          toast.error(result.error ?? (clearsRecipe ? 'Failed to clear recipe' : 'Failed to save recipe'))
        }
        return
      }

      // A response may arrive after this editor was replaced by another dish
      // or by navigation. The write is still valid, but its old toast and
      // refresh callback are not the latest UI intent.
      if (isCurrentWrite()) {
        toast.success(clearsRecipe ? 'Recipe cleared' : 'Recipe saved')
        onSaved?.()
      }
    } catch (error) {
      if (isCurrentWrite()) {
        toast.error(error instanceof Error ? error.message : 'Failed to save recipe')
      }
    } finally {
      if (mountedRef.current && latestWriteRef.current === writeId) {
        setIsSaving(false)
        onSavingChange?.(false)
      }
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

  if (loadError) {
    return (
      <p className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">
        {loadError}
      </p>
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
        <Label className="text-xs font-medium">{label ?? DEFAULT_LABEL}</Label>
        {estimatedCost > 0 && (
          <span className="text-[11px] text-muted-foreground">
            Est. cost ₱{estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      {/*
        A recipe line is four controls on one rail. Below `sm` the four do not
        fit a phone at any honest size, so the ingredient takes the first line
        and quantity, unit and remove share the second.
      */}
      <div className="space-y-2">
        {form.lines.map((line, index) => (
          <div key={line.uid ?? index} className="flex gap-2 max-sm:flex-wrap">
            <Select
              value={line.inventory_item_id || undefined}
              onValueChange={(value) => updateLine(index, { inventory_item_id: value })}
            >
              <SelectTrigger className="flex-1 max-sm:h-11 max-sm:w-full max-sm:flex-none">
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
              className="w-20 max-sm:h-11 max-sm:flex-1"
            />
            <Select
              value={line.unit_id || undefined}
              onValueChange={(value) => updateLine(index, { unit_id: value })}
            >
              <SelectTrigger className="w-24 max-sm:h-11">
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
              aria-label="Remove ingredient"
              onClick={() => removeLine(index)}
              className="shrink-0 text-red-500 max-sm:size-11"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {isPrep && (
        <div className="flex items-center gap-2 border-t pt-2 max-sm:flex-wrap">
          <Label htmlFor={yieldFieldId} className="shrink-0 text-xs">
            Yields
          </Label>
          <Input
            id={yieldFieldId}
            type="number"
            step="any"
            min={0}
            placeholder="Qty"
            value={form.yieldQuantity ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, yieldQuantity: e.target.value }))}
            className="w-24 max-sm:h-11 max-sm:flex-1"
          />
          <Select
            value={form.yieldUnitId || undefined}
            onValueChange={(value) => setForm((f) => ({ ...f, yieldUnitId: value }))}
          >
            <SelectTrigger className="w-24 max-sm:h-11">
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
          <p className="text-[11px] text-muted-foreground max-sm:w-full">
            The batch cost is divided by this to price one unit.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:h-11 max-sm:flex-1"
          onClick={addLine}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add ingredient
        </Button>
        <Button
          type="button"
          size="sm"
          className="max-sm:h-11 max-sm:flex-1"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save recipe'}
        </Button>
      </div>
    </div>
  )
}
