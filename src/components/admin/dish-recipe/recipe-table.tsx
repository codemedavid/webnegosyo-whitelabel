'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EVERY_ORDER, type DishRecipeDraft, type VersionTotal } from '@/lib/inventory/dish-recipe/model'
import type { LinesCost } from '@/lib/inventory/dish-recipe/cost'
import { AmountInput } from '@/components/admin/dish-recipe/amount-input'
import { AddIngredient, UnitSelect } from '@/components/admin/dish-recipe/ingredient-picker'
import type { IngredientChoices } from '@/components/admin/dish-recipe/types'

export interface TableColumn {
  key: string
  label: string
}

interface RecipeTableProps {
  draft: DishRecipeDraft
  columns: readonly TableColumn[]
  /** The one column a phone shows (version tabs). */
  activeColumn: string
  onActiveColumnChange: (column: string) => void
  choices: IngredientChoices
  problems: ReadonlyMap<string, string>
  /** Per column, only when the caller may see costs. */
  costs: ReadonlyMap<string, LinesCost> | null
  totals: readonly VersionTotal[]
  onAmount: (rowKey: string, column: string, value: number | null) => void
  onFill: (rowKey: string, value: number | null) => void
  onUnit: (rowKey: string, unitId: string) => void
  onRemove: (rowKey: string) => void
  onAdd: (ingredientId: string, stockUnitId: string) => void
}

function formatPesos(cost: LinesCost): string {
  return `${cost.isPartial ? '≥ ' : ''}₱${cost.pesos.toFixed(2)}`
}

/**
 * Ingredients down the side, versions across the top, and in each cell the
 * WHOLE amount that version uses. On a phone one version shows at a time,
 * picked by the tabs above.
 */
export function RecipeTable({
  draft,
  columns,
  activeColumn,
  onActiveColumnChange,
  choices,
  problems,
  costs,
  totals,
  onAmount,
  onFill,
  onUnit,
  onRemove,
  onAdd,
}: RecipeTableProps) {
  const isByVersion = columns.length > 1
  const hiddenOnPhone = (column: string) => (isByVersion && column !== activeColumn ? 'max-sm:hidden' : '')
  const takenIds = new Set(draft.rows.map((row) => row.inventoryItemId))
  const countByColumn = new Map(totals.map((total) => [total.column, total.lines.length]))

  return (
    <div className="space-y-2">
      {isByVersion && (
        <div role="tablist" aria-label="Version" className="flex gap-1.5 overflow-x-auto pb-1 sm:hidden">
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              role="tab"
              aria-selected={column.key === activeColumn}
              onClick={() => onActiveColumnChange(column.key)}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                column.key === activeColumn
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground',
              )}
            >
              {column.label}
              <span className="ml-1.5 text-xs opacity-75">{countByColumn.get(column.key) ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Ingredient</th>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cn('px-1.5 py-2 text-right font-medium', hiddenOnPhone(column.key))}>
                  {column.key === EVERY_ORDER ? 'Per order' : column.label}
                </th>
              ))}
              <th scope="col" className="px-1.5 py-2 font-medium">Unit</th>
              <th scope="col" className="w-px px-1.5 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {draft.rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No ingredients yet. Add the first one below.
                </td>
              </tr>
            )}
            {draft.rows.map((row) => {
              const name = choices.ingredientsById.get(row.inventoryItemId)?.name ?? 'Ingredient no longer in stock list'
              const problem = problems.get(row.key)
              const firstAmount = columns.map((column) => row.amounts[column.key] ?? null).find((value) => value !== null) ?? null
              return (
                <tr key={row.key} className="border-b last:border-b-0 align-top">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="block min-w-28 pt-2 font-medium max-sm:pt-3">{name}</span>
                    {problem && <span className="mt-1 block text-xs text-destructive">{problem}</span>}
                  </th>
                  {columns.map((column) => (
                    <td key={column.key} className={cn('px-1.5 py-2', hiddenOnPhone(column.key))}>
                      <AmountInput
                        value={row.amounts[column.key] ?? null}
                        onChange={(value) => onAmount(row.key, column.key, value)}
                        ariaLabel={`${name}, ${column.key === EVERY_ORDER ? 'per order' : column.label}`}
                        isInvalid={Boolean(problem)}
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-2">
                    <UnitSelect
                      choices={choices}
                      ingredientId={row.inventoryItemId}
                      unitId={row.unitId}
                      onChange={(unitId) => onUnit(row.key, unitId)}
                      ariaLabel={`${name} unit`}
                    />
                  </td>
                  <td className="px-1.5 py-2">
                    <div className="flex gap-0.5">
                      {isByVersion && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 whitespace-nowrap px-2 text-xs text-muted-foreground max-sm:h-11"
                          aria-label={`Use the same amount of ${name} for every version`}
                          disabled={firstAmount === null}
                          onClick={() => onFill(row.key, row.amounts[activeColumn] ?? firstAmount)}
                        >
                          Same for all
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive max-sm:h-11 max-sm:w-11"
                        aria-label={`Remove ${name}`}
                        onClick={() => onRemove(row.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {costs && draft.rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-xs text-muted-foreground">
                <th scope="row" className="px-3 py-2 text-left font-medium">Ingredient cost</th>
                {columns.map((column) => {
                  const cost = costs.get(column.key)
                  return (
                    <td key={column.key} className={cn('px-1.5 py-2 text-right tabular-nums', hiddenOnPhone(column.key))}>
                      {cost ? formatPesos(cost) : '—'}
                    </td>
                  )
                })}
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <AddIngredient choices={choices} takenIds={takenIds} onPick={onAdd} />
    </div>
  )
}
