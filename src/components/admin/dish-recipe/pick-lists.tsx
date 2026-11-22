'use client'

import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DishRecipeDraft, DishRecipeGroup, DraftLine } from '@/lib/inventory/dish-recipe/model'
import { AmountInput } from '@/components/admin/dish-recipe/amount-input'
import { AddIngredient, UnitSelect } from '@/components/admin/dish-recipe/ingredient-picker'
import type { IngredientChoices } from '@/components/admin/dish-recipe/types'

interface PickListsProps {
  draft: DishRecipeDraft
  /** Every list except the one the table is built over. */
  groups: readonly DishRecipeGroup[]
  choices: IngredientChoices
  problems: ReadonlyMap<string, string>
  onAdd: (optionId: string, ingredientId: string, stockUnitId: string) => void
  onUpdate: (optionId: string, lineKey: string, patch: Partial<Pick<DraftLine, 'quantity' | 'unitId'>>) => void
  onRemove: (optionId: string, lineKey: string) => void
  onCopy: (fromOptionId: string, toOptionIds: string[]) => void
}

function lineCount(draft: DishRecipeDraft, group: DishRecipeGroup): number {
  return group.options.filter((option) => (draft.picks[option.id] ?? []).length > 0).length
}

/**
 * Choices outside the table: what ONE pick adds on top of the recipe above
 * (an extra shot, a sugar level, an add-on). Each list folds away; the
 * summary says how many of its choices take stock.
 */
export function PickLists({ draft, groups, choices, problems, onAdd, onUpdate, onRemove, onCopy }: PickListsProps) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(groups.filter((group) => lineCount(draft, group) > 0).map((group) => group.id)),
  )
  if (groups.length === 0) return null

  const toggle = (groupId: string) =>
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })

  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-medium">Choices that add more</h4>
        <p className="text-xs text-muted-foreground">
          What one pick adds on top of the recipe above. Leave a choice empty if it uses nothing extra.
        </p>
      </div>
      {groups.map((group) => {
        const isOpen = openIds.has(group.id)
        const withStock = lineCount(draft, group)
        const panelId = `pick-list-${group.id}`
        return (
          <div key={group.id} className="rounded-lg border bg-background">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(group.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left max-sm:py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{group.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {withStock === 0
                    ? 'No extra ingredients'
                    : `${withStock} of ${group.options.length} ${group.options.length === 1 ? 'choice adds' : 'choices add'} ingredients`}
                </span>
              </span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div id={panelId} className="divide-y border-t">
                {group.options.map((option) => {
                  const lines = draft.picks[option.id] ?? []
                  const others = group.options.filter((other) => other.id !== option.id).map((other) => other.id)
                  const wording = group.isPickOne ? 'This pick adds' : 'Each one adds'
                  return (
                    <div key={option.id} className="space-y-2 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">
                          {option.name}
                          {lines.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">· {wording.toLowerCase()}</span>}
                        </span>
                        {lines.length > 0 && others.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground max-sm:h-10"
                            onClick={() => onCopy(option.id, others)}
                          >
                            Copy to the other {others.length === 1 ? 'choice' : `${others.length}`}
                          </Button>
                        )}
                      </div>
                      {lines.map((line) => {
                        const name = choices.ingredientsById.get(line.inventoryItemId)?.name ?? 'Ingredient no longer in stock list'
                        const problem = problems.get(line.key)
                        return (
                          <div key={line.key} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                              <AmountInput
                                value={line.quantity}
                                onChange={(quantity) => onUpdate(option.id, line.key, { quantity })}
                                ariaLabel={`${name} for ${option.name}`}
                                isInvalid={Boolean(problem)}
                                className="w-20 min-w-0 shrink-0"
                              />
                              <UnitSelect
                                choices={choices}
                                ingredientId={line.inventoryItemId}
                                unitId={line.unitId}
                                onChange={(unitId) => onUpdate(option.id, line.key, { unitId })}
                                ariaLabel={`${name} unit for ${option.name}`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive max-sm:h-11 max-sm:w-11"
                                aria-label={`Remove ${name} from ${option.name}`}
                                onClick={() => onRemove(option.id, line.key)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            {problem && <p className="text-xs text-destructive">{problem}</p>}
                          </div>
                        )
                      })}
                      <AddIngredient
                        choices={choices}
                        takenIds={new Set(lines.map((line) => line.inventoryItemId))}
                        onPick={(ingredientId, stockUnitId) => onAdd(option.id, ingredientId, stockUnitId)}
                        label={lines.length === 0 ? 'Add an ingredient' : 'Add another'}
                        className="h-8 text-xs max-sm:h-10"
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
