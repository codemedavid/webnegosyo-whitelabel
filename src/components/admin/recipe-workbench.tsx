'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Search, UtensilsCrossed } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { findUnusedIngredients, summarizeRecipeCoverage } from '@/lib/inventory/recipe-coverage'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import {
  COVERAGE_FILTERS,
  countByStatus,
  filterCoverageRows,
  type CoverageFilter,
} from '@/lib/inventory/recipe-workbench'
import { cn } from '@/lib/utils'
import type { InventoryItem, RecipeComponent } from '@/types/database'

interface RecipeWorkbenchProps {
  tenantId: string
  tenantSlug: string
  rows: RecipeCoverageRow[]
  ingredients: InventoryItem[]
  components: RecipeComponent[]
  /**
   * The coverage read failed. Without this an error is indistinguishable from
   * an empty menu, because the read catches its own failures and returns an
   * empty list — so the screen would confidently report "no dishes" when the
   * dishes exist and something else broke.
   */
  loadFailed?: boolean
}

/**
 * Pick a dish on the left, build its recipe on the right.
 *
 * Replaces a tab that could only link out to the menu-item form. Every recipe
 * used to cost a page navigation, a scroll past the cost fields and a trip
 * back — and with no search you could not find the dish you meant on a 51-dish
 * menu. The first tenant to switch inventory on wrote zero recipes.
 *
 * `RecipeEditor` is reused untouched: it already loads and saves a recipe for
 * any target on its own round-trip, so keying it to the selected dish is all
 * that was needed. Everything here is the picker around it.
 */
export function RecipeWorkbench({
  tenantId,
  tenantSlug,
  rows,
  ingredients,
  components,
  loadFailed = false,
}: RecipeWorkbenchProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<CoverageFilter>('all')

  // The list is ordered actionable-first, so the first row is the best default.
  // Landing on an empty pane would throw away the one decision already made.
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.menuItemId ?? null)

  const counts = useMemo(() => countByStatus(rows), [rows])
  const summary = useMemo(() => summarizeRecipeCoverage(rows), [rows])
  const unused = useMemo(
    () => findUnusedIngredients(ingredients, components),
    [ingredients, components],
  )
  const visible = useMemo(
    () => filterCoverageRows(rows, { query, status }),
    [rows, query, status],
  )

  const selected = rows.find((row) => row.menuItemId === selectedId) ?? null

  // A recipe is built out of ingredients, so an empty shelf makes every other
  // control here a dead end. Say the one useful thing instead.
  if (ingredients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center">
        <UtensilsCrossed className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">Add ingredients first</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          A recipe is built from ingredients, so start on the Ingredients tab. Once you have a few,
          come back to link them to your dishes.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
        <div>
          <p className="font-medium">
            {summary.covered} of {summary.total} dishes have a recipe
          </p>
          <p className="text-sm text-muted-foreground">
            A dish with no recipe never touches your stock — nothing is deducted when it sells.
          </p>
        </div>
        {summary.uncovered === 0 ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            All set up
          </Badge>
        ) : (
          <Badge variant="destructive">{summary.uncovered} to set up</Badge>
        )}
      </div>

      {unused.length > 0 && (
        <div className="rounded-xl border bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Not used by any recipe
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            These are in stock but nothing consumes them, so their quantity will never change on
            its own.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {unused.map((item) => (
              <Badge key={item.id} variant="outline" className="bg-background">
                {item.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        {/* ---- picker ---- */}
        <div data-testid="workbench-picker" className="rounded-xl border bg-card">
          <div className="space-y-3 border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search dishes"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {COVERAGE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatus(filter.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    status === filter.value
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                >
                  {filter.label} {counts[filter.value]}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[28rem] overflow-y-auto p-2">
            {visible.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {/*
                  Three different situations that used to render the same
                  sentence. Blaming a search nobody typed is how a broken read
                  gets mistaken for an empty menu.
                */}
                {loadFailed
                  ? 'We could not load your dishes. Reload the page, and if it keeps happening the menu read is failing.'
                  : rows.length === 0
                    ? 'No dishes on your menu yet. Add one under Menu Management, then come back to give it a recipe.'
                    : 'No dishes match that search.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {visible.map((row) => {
                  const isSelected = row.menuItemId === selectedId
                  return (
                    <li key={row.menuItemId}>
                      <button
                        type="button"
                        data-testid={`dish-${row.menuItemId}`}
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => setSelectedId(row.menuItemId)}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                            : 'border-transparent hover:bg-muted/60',
                        )}
                      >
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        <span
                          className={cn(
                            'mt-0.5 block text-xs',
                            row.hasRecipe ? 'text-muted-foreground' : 'text-destructive',
                          )}
                        >
                          {row.hasRecipe
                            ? `${row.ingredientCount} ingredient${row.ingredientCount === 1 ? '' : 's'}`
                            : 'No recipe yet'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ---- editor ---- */}
        <div data-testid="workbench-editor-pane" className="rounded-xl border bg-card p-4">
          {selected ? (
            <>
              <div className="mb-4 border-b pb-3">
                <p className="text-lg font-semibold">{selected.name}</p>
                <p className="text-sm text-muted-foreground">
                  Ingredients used every time this dish sells.
                </p>
              </div>
              <RecipeEditor
                // Remounts on dish change so the editor reloads rather than
                // showing the previous dish's lines against the new heading.
                key={selected.menuItemId}
                tenantId={tenantId}
                tenantSlug={tenantSlug}
                target={{ type: 'menu_item', menuItemId: selected.menuItemId }}
                label="Base recipe"
              />
            </>
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Choose a dish on the left to build its recipe.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
