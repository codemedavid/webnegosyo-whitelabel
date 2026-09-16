'use client'

/**
 * The dates a dish is promised for, one row each: how much sold against
 * the offer, a stepper that can never go below what already sold, and a
 * remove that is refused once anything has sold.
 *
 * Every control edits the form's draft in place. There is no busy state
 * because nothing here talks to the server — the dish's own save writes the
 * whole draft at once.
 */

import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPresellDateLong } from '@/lib/presell/month-grid'
import { describeAllocationStatus, type AllocationStatus } from '@/lib/presell/admin-allocations'
import { resolvePresellRemaining, type PresellAllocationRow } from '@/lib/presell/availability'

interface PresellAllocationListProps {
  rows: readonly PresellAllocationRow[]
  selectedDate: string | null
  onSelect: (dateKey: string) => void
  onSetStock: (row: PresellAllocationRow, stockQty: number) => void
  onRemove: (row: PresellAllocationRow) => void
}

const STATUS_DOT: Record<AllocationStatus, string> = {
  open: 'bg-emerald-500',
  low: 'bg-amber-500',
  'sold-out': 'bg-muted-foreground/40',
}

const STATUS_BAR: Record<AllocationStatus, string> = {
  open: 'bg-emerald-500',
  low: 'bg-amber-500',
  'sold-out': 'bg-muted-foreground/50',
}

const STEPPER_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30'

export function StockStepper({ row, onSetStock }: Pick<PresellAllocationListProps, 'onSetStock'> & { row: PresellAllocationRow }) {
  const [draft, setDraft] = useState<string | null>(null)
  const label = formatPresellDateLong(row.presell_date)

  /** Step from the stored figure, discarding any half-typed draft that would otherwise keep shadowing it. */
  const step = (delta: number) => {
    setDraft(null)
    onSetStock(row, row.stock_qty + delta)
  }

  const commitDraft = () => {
    if (draft === null) return
    const qty = Number(draft)
    setDraft(null)
    if (!Number.isInteger(qty) || qty < 0 || qty === row.stock_qty) return
    onSetStock(row, Math.max(qty, row.sold_qty))
  }

  return (
    <div className="inline-flex items-center rounded-lg border bg-background">
      <button
        type="button"
        aria-label={`Decrease stock for ${label}`}
        disabled={row.stock_qty <= row.sold_qty}
        onClick={() => step(-1)}
        className={STEPPER_BUTTON}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={row.sold_qty}
        step={1}
        aria-label={`Stock for ${label}`}
        value={draft ?? row.stock_qty}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft() } }}
        className="h-8 w-12 border-x bg-transparent text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] focus:bg-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={`Increase stock for ${label}`}
        onClick={() => step(1)}
        className={STEPPER_BUTTON}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function PresellAllocationList({ rows, selectedDate, onSelect, onSetStock, onRemove }: PresellAllocationListProps) {
  return (
    <ul aria-label="Upcoming dates" className="divide-y rounded-xl border bg-card">
      {rows.map((row) => {
        const status = describeAllocationStatus(row)
        const remaining = resolvePresellRemaining(row.stock_qty, row.sold_qty)
        const soldShare = row.stock_qty > 0 ? Math.min(100, Math.round((row.sold_qty / row.stock_qty) * 100)) : 100
        const isSelected = selectedDate === row.presell_date
        const label = formatPresellDateLong(row.presell_date)

        return (
          <li
            key={row.presell_date}
            className={cn('flex flex-col gap-2 px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:gap-3', isSelected && 'bg-muted/60')}
          >
            <button
              type="button"
              onClick={() => onSelect(row.presell_date)}
              className="flex min-w-0 flex-1 flex-col gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2">
                <i aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[status])} />
                <span className="text-sm font-semibold">{label}</span>
                {status === 'sold-out' && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sold out
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 pl-4">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <span className={cn('block h-full rounded-full transition-[width] duration-300', STATUS_BAR[status])} style={{ width: `${soldShare}%` }} />
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.sold_qty} sold · {remaining} left
                </span>
              </span>
            </button>

            <div className="flex items-center gap-1 pl-4 sm:pl-0">
              <StockStepper row={row} onSetStock={onSetStock} />
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => onRemove(row)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
