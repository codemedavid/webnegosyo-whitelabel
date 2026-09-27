'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil, Ruler } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ColumnMapping } from '@/lib/inventory/import/column-matching'
import type { ImportPlan, RowStatus } from '@/lib/inventory/import/import-plan'
import { STORE_POOL_LABEL } from '@/lib/inventory/stock-outlet'
import type { InventoryUnitRow } from '@/types/database'
import { ReviewRow, STATUS_STYLE } from '@/components/admin/inventory-import/review-row'

const PAGE_SIZE = 60
const STORE_POOL = '__store__'

type Filter = 'all' | RowStatus

interface Branch {
  id: string
  name: string
}

interface ReviewStepProps {
  plan: ImportPlan
  mapping: ColumnMapping
  units: readonly InventoryUnitRow[]
  branches: readonly Branch[]
  wasAutoMatched: boolean
  updateExistingStock: boolean
  outletId: string | null
  onPickUnit: (key: string, unitId: string) => void
  onUpdateExistingStock: (value: boolean) => void
  onOutletChange: (outletId: string | null) => void
  onEditColumns: () => void
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'create', label: 'New' },
  { key: 'update', label: 'Updates' },
  { key: 'unchanged', label: 'No change' },
  { key: 'error', label: 'Needs fixing' },
]

function UnitFixes({ plan, units, onPickUnit }: Pick<ReviewStepProps, 'plan' | 'units' | 'onPickUnit'>) {
  if (plan.unresolvedUnits.length === 0) return null
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <Ruler className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <h3 className="text-sm font-semibold">
          {plan.unresolvedUnits.length === 1
            ? 'One unit we don’t recognise'
            : `${plan.unresolvedUnits.length} units we don’t recognise`}
        </h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Pick what each one means. Every row using it follows.</p>
      <ul className="mt-3 space-y-2">
        {plan.unresolvedUnits.map((unit) => (
          <li key={unit.key} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">“{unit.label}”</span>{' '}
              <span className="text-muted-foreground">
                · {unit.rowCount} {unit.rowCount === 1 ? 'row' : 'rows'}
              </span>
            </span>
            <Select onValueChange={(value) => onPickUnit(unit.key, value)}>
              <SelectTrigger aria-label={`Unit for “${unit.label}”`} className="w-44 bg-background max-sm:h-11 max-sm:w-full">
                <SelectValue placeholder="Choose a unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} ({option.abbreviation})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StockOptions(props: ReviewStepProps) {
  const { plan, mapping, branches, updateExistingStock, outletId, onUpdateExistingStock, onOutletChange } = props
  if (!mapping.includes('on_hand')) return null
  const hasExisting = plan.rows.some((row) => row.existingId !== null)
  if (!hasExisting && branches.length === 0) return null

  return (
    <section className="space-y-4 rounded-2xl border p-4">
      {hasExisting && (
        <div className="flex items-start justify-between gap-4">
          <Label htmlFor="import-update-stock" className="block cursor-pointer space-y-0.5">
            <span className="block text-sm font-medium">Update stock on hand for ingredients you already have</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Saved as a stock count. Leave off if these numbers are from an older file.
            </span>
          </Label>
          <Switch id="import-update-stock" checked={updateExistingStock} onCheckedChange={onUpdateExistingStock} />
        </div>
      )}
      {branches.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Record stock counts at</p>
          <Select value={outletId ?? STORE_POOL} onValueChange={(value) => onOutletChange(value === STORE_POOL ? null : value)}>
            <SelectTrigger aria-label="Branch for stock counts" className="w-52 max-sm:h-11 max-sm:w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STORE_POOL}>{STORE_POOL_LABEL}</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </section>
  )
}

export function ReviewStep(props: ReviewStepProps) {
  const { plan, units, wasAutoMatched, onEditColumns } = props
  const [filter, setFilter] = useState<Filter>(plan.summary.error > 0 ? 'error' : 'all')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const unitAbbreviation = useMemo(() => {
    const byId = new Map(units.map((unit) => [unit.id, unit.abbreviation]))
    return (id: string) => byId.get(id) ?? ''
  }, [units])

  const countOf = (key: Filter) => (key === 'all' ? plan.summary.total : plan.summary[key])
  // Fixing the last unknown unit empties "Needs fixing" under the merchant's
  // feet; the list falls back to everything rather than to an empty box.
  const activeFilter: Filter = countOf(filter) > 0 ? filter : 'all'
  const visible = activeFilter === 'all' ? plan.rows : plan.rows.filter((row) => row.status === activeFilter)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {wasAutoMatched ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            Every column matched
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onEditColumns}
          className="flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Pencil className="h-3.5 w-3.5" />
          Change column matching
        </button>
      </div>

      <UnitFixes plan={plan} units={units} onPickUnit={props.onPickUnit} />
      <StockOptions {...props} />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Show rows">
        {FILTERS.filter((item) => item.key === 'all' || countOf(item.key) > 0).map((item) => {
          const isActive = activeFilter === item.key
          const tone = item.key === 'all' ? null : STATUS_STYLE[item.key].pill
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setFilter(item.key)
                setLimit(PAGE_SIZE)
              }}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors max-sm:py-2.5',
                isActive ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted',
              )}
            >
              {item.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  isActive ? 'bg-background/20' : (tone ?? 'bg-muted'),
                )}
              >
                {countOf(item.key)}
              </span>
            </button>
          )
        })}
      </div>

      <ul className="divide-y rounded-2xl border">
        {visible.slice(0, limit).map((row) => (
          <ReviewRow key={row.rowNumber} row={row} unitAbbreviation={unitAbbreviation} />
        ))}
        {visible.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">No rows here.</li>
        )}
      </ul>
      {visible.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
          className="w-full rounded-xl border py-2.5 text-sm font-medium hover:bg-muted"
        >
          Show {Math.min(PAGE_SIZE, visible.length - limit)} more of {visible.length - limit}
        </button>
      )}
    </div>
  )
}
