'use client'

/**
 * A dish's whole recipe on one screen: the table of what each version
 * (size, flavour…) uses IN TOTAL, the extras other choices add, and the
 * checks that catch a recipe counted twice. Plan:
 * docs/plans/2026-11-21-dish-recipes-by-size.md.
 *
 * The owner types totals; `toStored` splits them into the dish recipe (the
 * shared part) and each choice's extra, which is what depletion, the POS and
 * the reports already read. Saving is one transaction
 * (`/api/inventory/dish-recipe` → `save_dish_recipes`) guarded by a version,
 * so a save never half-lands or overwrites another screen's save.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  addPickLine,
  addRow,
  copyPicks,
  defaultByGroup,
  draftColumns,
  EVERY_ORDER,
  fillRow,
  isDraftDirty,
  removePickLine,
  removeRow,
  setByGroup,
  setRowAmount,
  setRowUnit,
  tableGroups,
  toDraft,
  toStored,
  updatePickLine,
  versionTotals,
  type DishRecipeDraft,
  type DishRecipeGroup,
  type DishRecipes,
} from '@/lib/inventory/dish-recipe/model'
import { countOnce, findDishRecipeIssues, type DishRecipeIssue } from '@/lib/inventory/dish-recipe/checks'
import { copyDishRecipes } from '@/lib/inventory/dish-recipe/copy'
import { costOfLines, type LinesCost } from '@/lib/inventory/dish-recipe/cost'
import { findDraftProblems } from '@/lib/inventory/dish-recipe/validate'
import { useCanSeeCosts } from '@/components/admin/inventory-manager/cost-visibility'
import { RecipeTable, type TableColumn } from '@/components/admin/dish-recipe/recipe-table'
import { PickLists } from '@/components/admin/dish-recipe/pick-lists'
import type { IngredientChoices, PanelIngredient, PanelUnit } from '@/components/admin/dish-recipe/types'

interface Snapshot {
  menuItemId: string
  dishName: string
  groups: DishRecipeGroup[]
  recipes: DishRecipes
  version: string
}

interface LoadedData {
  ingredients: PanelIngredient[]
  units: PanelUnit[]
  snapshot: Snapshot
}

export interface CopySource {
  menuItemId: string
  name: string
}

interface DishRecipePanelProps {
  tenantId: string
  tenantSlug: string
  menuItemId: string
  /** Other dishes whose recipe can be copied in as a start. */
  copySources?: readonly CopySource[]
  onSaved?: () => void
  onSavingChange?: (isSaving: boolean) => void
}

const NOTHING = '__none__'

async function fetchDish(tenantId: string, menuItemId: string, signal?: AbortSignal): Promise<LoadedData> {
  const search = new URLSearchParams({ tenantId, menuItemId })
  const response = await fetch(`/api/inventory/dish-recipe?${search}`, { credentials: 'same-origin', signal })
  const payload = (await response.json().catch(() => ({}))) as { data?: LoadedData; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error ?? 'The recipes could not be loaded. Try again.')
  return {
    ...payload.data,
    units: payload.data.units.map((unit) => ({ ...unit, to_base_factor: Number(unit.to_base_factor) })),
  }
}

function amountLabel(quantity: number, unitId: string, units: ReadonlyMap<string, PanelUnit>): string {
  const unit = units.get(unitId)
  return `${Number(quantity.toFixed(4))} ${unit?.abbreviation || unit?.name || ''}`.trim()
}

export function DishRecipePanel({
  tenantId,
  tenantSlug,
  menuItemId,
  copySources,
  onSaved,
  onSavingChange,
}: DishRecipePanelProps) {
  const canSeeCosts = useCanSeeCosts()
  const [data, setData] = useState<LoadedData | null>(null)
  const [draft, setDraft] = useState<DishRecipeDraft | null>(null)
  const [activeColumn, setActiveColumn] = useState<string>(EVERY_ORDER)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [hasTriedSave, setHasTriedSave] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const adopt = useCallback((loaded: LoadedData, byGroupId?: string | null) => {
    const { groups, recipes } = loaded.snapshot
    const valid = tableGroups(groups).some((group) => group.id === byGroupId)
    const chosen = byGroupId !== undefined && (byGroupId === null || valid) ? byGroupId : defaultByGroup(recipes, groups)
    const next = toDraft(recipes, groups, chosen, loaded.units)
    setData(loaded)
    setDraft(next)
    setActiveColumn(draftColumns(next, groups)[0] ?? EVERY_ORDER)
    setIsStale(false)
    setHasTriedSave(false)
  }, [])

  const load = useCallback(
    async (signal?: AbortSignal, byGroupId?: string | null) => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const loaded = await fetchDish(tenantId, menuItemId, signal)
        if (!signal?.aborted && mountedRef.current) adopt(loaded, byGroupId)
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        if (mountedRef.current) setLoadError(error instanceof Error ? error.message : 'The recipes could not be loaded.')
      } finally {
        if (!signal?.aborted && mountedRef.current) setIsLoading(false)
      }
    },
    [tenantId, menuItemId, adopt],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const choices = useMemo<IngredientChoices | null>(() => {
    if (!data) return null
    return {
      ingredients: [...data.ingredients].sort((a, b) => a.name.localeCompare(b.name)),
      ingredientsById: new Map(data.ingredients.map((ingredient) => [ingredient.id, ingredient])),
      units: data.units,
      unitsById: new Map(data.units.map((unit) => [unit.id, unit])),
    }
  }, [data])

  const groups = useMemo<DishRecipeGroup[]>(() => data?.snapshot.groups ?? [], [data])
  const stored = useMemo(() => (draft ? toStored(draft, groups) : null), [draft, groups])
  const issues = useMemo(
    () => (stored && data ? findDishRecipeIssues(stored, groups, data.units) : []),
    [stored, groups, data],
  )
  const problems = useMemo(() => {
    if (!draft || !choices) return new Map<string, string>()
    return new Map(
      findDraftProblems(draft, groups, choices.ingredientsById, choices.units).map((problem) => [problem.key, problem.message]),
    )
  }, [draft, groups, choices])
  const isDirty = Boolean(draft && data && isDraftDirty(data.snapshot.recipes, draft, groups))

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading recipe…
      </div>
    )
  }
  if (loadError && !data) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-xs text-destructive">
        <span>{loadError}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
      </div>
    )
  }
  if (!data || !draft || !choices || !stored) return null
  if (data.ingredients.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        No ingredients yet. Add ingredients in <span className="font-medium">Inventory</span> first, then attach them here.
      </p>
    )
  }

  const byGroups = tableGroups(groups)
  const byGroup = byGroups.find((group) => group.id === draft.byGroupId) ?? null
  const columns: TableColumn[] = byGroup
    ? byGroup.options.map((option) => ({ key: option.id, label: option.name }))
    : [{ key: EVERY_ORDER, label: 'Per order' }]
  const otherGroups = groups.filter((group) => group.id !== draft.byGroupId)
  const totals = versionTotals(draft, groups)
  const costs: ReadonlyMap<string, LinesCost> | null = canSeeCosts
    ? new Map(totals.map((total) => [total.column, costOfLines(total.lines, choices.ingredientsById, choices.units)]))
    : null
  const shownProblems = hasTriedSave ? problems : new Map<string, string>()

  const edit = (next: DishRecipeDraft) => setDraft(next)

  const changeByGroup = (value: string) => {
    const next = setByGroup(draft, groups, value === NOTHING ? null : value, choices.units)
    setDraft(next)
    setActiveColumn(draftColumns(next, groups)[0] ?? EVERY_ORDER)
  }

  const fixIssue = (issue: DishRecipeIssue) => {
    if (issue.kind === 'counted_twice') {
      setDraft(countOnce(draft, groups, issue, choices.units))
      return
    }
    changeByGroup(issue.groupId)
  }

  const copyFrom = async (sourceId: string) => {
    const source = copySources?.find((candidate) => candidate.menuItemId === sourceId)
    if (!source) return
    setIsCopying(true)
    try {
      const loaded = await fetchDish(tenantId, sourceId)
      const result = copyDishRecipes({ groups: loaded.snapshot.groups, recipes: loaded.snapshot.recipes }, groups)
      const previous = draft
      const next = toDraft(result.recipes, groups, defaultByGroup(result.recipes, groups), choices.units)
      // Every row came from elsewhere: its shared part belongs in this dish's recipe.
      setDraft({ ...next, rows: next.rows.map((row) => ({ ...row, baseHint: undefined })) })
      setActiveColumn(draftColumns(next, groups)[0] ?? EVERY_ORDER)
      const matched = result.matchedOptionIds.length
      const total = groups.reduce((sum, group) => sum + group.options.length, 0)
      toast.success(`Copied from ${source.name}. Check the amounts, then save.`, {
        description: total > 0 ? `${matched} of ${total} choices matched by name.` : undefined,
        action: { label: 'Undo', onClick: () => setDraft(previous) },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That recipe could not be copied.')
    } finally {
      if (mountedRef.current) setIsCopying(false)
    }
  }

  const save = async () => {
    if (problems.size > 0) {
      setHasTriedSave(true)
      toast.error([...problems.values()][0])
      return
    }
    setIsSaving(true)
    onSavingChange?.(true)
    try {
      const response = await fetch('/api/inventory/dish-recipe', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, tenantSlug, menuItemId, version: data.snapshot.version, recipes: stored }),
        keepalive: true,
      })
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        code?: string
        data?: { snapshot: Snapshot; written: number }
      }
      if (!mountedRef.current) return
      if (response.status === 409 || payload.code === 'stale') {
        setIsStale(true)
        toast.error(payload.error ?? 'These recipes were changed on another screen.')
        return
      }
      if (!response.ok || !payload.success || !payload.data) {
        toast.error(payload.error ?? 'The recipes could not be saved. Try again.')
        return
      }
      adopt({ ...data, snapshot: payload.data.snapshot }, draft.byGroupId)
      toast.success(payload.data.written === 0 ? 'Nothing had changed' : 'Recipe saved')
      onSaved?.()
    } catch (error) {
      if (mountedRef.current) toast.error(error instanceof Error ? error.message : 'The recipes could not be saved. Try again.')
    } finally {
      if (mountedRef.current) {
        setIsSaving(false)
        onSavingChange?.(false)
      }
    }
  }

  const otherDishes = (copySources ?? []).filter((source) => source.menuItemId !== menuItemId)

  return (
    <div className="space-y-4">
      {byGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Label htmlFor={`dish-recipe-by-${menuItemId}`} className="text-sm">Amounts change by</Label>
          <Select value={draft.byGroupId ?? NOTHING} onValueChange={changeByGroup}>
            <SelectTrigger id={`dish-recipe-by-${menuItemId}`} className="h-9 w-auto min-w-40 max-sm:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOTHING}>Nothing — same every order</SelectItem>
              {byGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="basis-full text-xs text-muted-foreground">
            {byGroup
              ? `Type everything each ${byGroup.name.toLowerCase()} uses in total, cup and all. We work out the rest.`
              : 'Type what one order uses. If a bigger size uses more, pick the list it changes by.'}
          </p>
        </div>
      )}

      {issues.map((issue) => (
        <IssueBanner key={issue.id} issue={issue} choices={choices} onFix={() => fixIssue(issue)} />
      ))}

      <RecipeTable
        draft={draft}
        columns={columns}
        activeColumn={activeColumn}
        onActiveColumnChange={setActiveColumn}
        choices={choices}
        problems={shownProblems}
        costs={costs}
        totals={totals}
        onAmount={(rowKey, column, value) => edit(setRowAmount(draft, rowKey, column, value))}
        onFill={(rowKey, value) => edit(fillRow(draft, groups, rowKey, value))}
        onUnit={(rowKey, unitId) => edit(setRowUnit(draft, rowKey, unitId))}
        onRemove={(rowKey) => edit(removeRow(draft, rowKey))}
        onAdd={(ingredientId, unitId) => edit(addRow(draft, groups, ingredientId, unitId))}
      />

      <PickLists
        key={draft.byGroupId ?? NOTHING}
        draft={draft}
        groups={otherGroups}
        choices={choices}
        problems={shownProblems}
        onAdd={(optionId, ingredientId, unitId) => edit(addPickLine(draft, optionId, ingredientId, unitId))}
        onUpdate={(optionId, lineKey, patch) => edit(updatePickLine(draft, optionId, lineKey, patch))}
        onRemove={(optionId, lineKey) => edit(removePickLine(draft, optionId, lineKey))}
        onCopy={(fromId, toIds) => edit(copyPicks(draft, fromId, toIds))}
      />

      {isStale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <span>Someone saved these recipes on another screen. Reload to see theirs — your changes here will be lost.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void load(undefined, draft.byGroupId)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reload
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {otherDishes.length > 0 ? (
          <Select value="" onValueChange={(id) => void copyFrom(id)} disabled={isCopying || isSaving}>
            <SelectTrigger aria-label="Copy the recipe of another dish" className="h-9 w-auto max-w-full text-muted-foreground max-sm:h-11">
              {isCopying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              <SelectValue placeholder="Copy from another dish" />
            </SelectTrigger>
            <SelectContent>
              {otherDishes.map((source) => (
                <SelectItem key={source.menuItemId} value={source.menuItemId}>{source.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button type="button" onClick={() => void save()} disabled={isSaving || isStale || !isDirty} className="max-sm:h-11">
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save recipe
          </Button>
        </div>
      </div>
    </div>
  )
}

function IssueBanner({
  issue,
  choices,
  onFix,
}: {
  issue: DishRecipeIssue
  choices: IngredientChoices
  onFix: () => void
}) {
  let message: string
  let action: string
  if (issue.kind === 'counted_twice') {
    const name = choices.ingredientsById.get(issue.inventoryItemId)?.name ?? 'An ingredient'
    const once = amountLabel(issue.baseQuantity, issue.unitId, choices.unitsById)
    message = `${name} is counted twice: the dish already uses ${once}, and every ${issue.groupName.toLowerCase()} adds ${once} again, so each sale takes ${amountLabel(issue.baseQuantity * 2, issue.unitId, choices.unitsById)}.`
    action = 'Count it once'
  } else {
    message = `Every ${issue.groupName.toLowerCase()} takes the same amounts. If a bigger one uses more, enter the amounts by ${issue.groupName.toLowerCase()}.`
    action = `Enter by ${issue.groupName.toLowerCase()}`
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span className="flex min-w-0 flex-1 gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </span>
      <Button type="button" size="sm" variant="outline" className="bg-background max-sm:h-10" onClick={onFix}>
        {action}
      </Button>
    </div>
  )
}
