'use client'

import { ArrowRight, CircleAlert, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlannedRow, RowStatus } from '@/lib/inventory/import/import-plan'

export const STATUS_STYLE: Record<RowStatus, { label: string; pill: string }> = {
  create: {
    label: 'New',
    pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  update: {
    label: 'Update',
    pill: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  unchanged: {
    label: 'No change',
    pill: 'bg-muted text-muted-foreground',
  },
  error: {
    label: 'Fix',
    pill: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 4 })

interface ReviewRowProps {
  row: PlannedRow
  unitAbbreviation: (unitId: string) => string
}

function NewSummary({ row, unitAbbreviation }: ReviewRowProps) {
  if (!row.input) return null
  const unit = unitAbbreviation(row.input.stock_unit_id)
  const parts = [
    row.input.category,
    `${peso.format(row.input.unit_cost)} / ${unit}`,
    row.onHand !== null ? `${row.onHand} ${unit} on hand` : null,
    row.input.is_prep ? 'Prep item' : null,
  ].filter(Boolean)
  return <p className="truncate text-xs text-muted-foreground">{parts.join(' · ')}</p>
}

function Changes({ row }: Pick<ReviewRowProps, 'row'>) {
  if (row.status === 'unchanged') return <p className="text-xs text-muted-foreground">Already up to date</p>
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {row.changes.map((change) => (
        <li key={change.field} className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{change.label}</span>
          <span className="text-muted-foreground line-through decoration-muted-foreground/50">{change.from}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" aria-label="becomes" />
          <span className="font-medium">{change.to}</span>
        </li>
      ))}
    </ul>
  )
}

export function ReviewRow({ row, unitAbbreviation }: ReviewRowProps) {
  const style = STATUS_STYLE[row.status]
  const errors = row.issues.filter((issue) => issue.severity === 'error')
  const warnings = row.issues.filter((issue) => issue.severity === 'warning')

  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="w-8 shrink-0 pt-0.5 text-right text-xs text-muted-foreground tabular-nums" title="Row in your file">
        {row.rowNumber}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-sm font-medium', !row.name && 'italic text-muted-foreground')}>
            {row.name || 'No name'}
          </p>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', style.pill)}>
            {style.label}
          </span>
        </div>

        {row.status === 'create' && <NewSummary row={row} unitAbbreviation={unitAbbreviation} />}
        {(row.status === 'update' || row.status === 'unchanged') && <Changes row={row} />}

        {errors.map((issue, index) => (
          <p key={`e${index}`} className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300">
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            {issue.message}
          </p>
        ))}
        {warnings.map((issue, index) => (
          <p key={`w${index}`} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            {issue.message}
          </p>
        ))}
      </div>
    </li>
  )
}
