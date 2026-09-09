'use client'

/**
 * The merchant's month view of one dish's presell dates.
 *
 * Every cell says what it is at a glance: an offered date wears its
 * remaining-of-stock figure and a status tint, a sold-out date is struck,
 * a past date is inert. Tapping any upcoming day selects it — the panel
 * then shows the editor for that day, allocated or not.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildMonthGrid,
  formatMonthTitle,
  formatPresellDayLabel,
  monthCursorOf,
  shiftMonth,
  WEEKDAY_LABELS,
  type MonthCursor,
} from '@/lib/presell/month-grid'
import { describeAllocationStatus, type AllocationStatus } from '@/lib/presell/admin-allocations'
import { resolvePresellRemaining, type PresellAllocationRow } from '@/lib/presell/availability'

interface PresellAllocationCalendarProps {
  rows: readonly PresellAllocationRow[]
  todayKey: string
  selectedDate: string | null
  onSelect: (dateKey: string) => void
  /** Month to open on; defaults to the selected date, else today. */
  initialDate?: string
}

const STATUS_CELL: Record<AllocationStatus, string> = {
  open: 'border-emerald-500/40 bg-emerald-500/10 text-foreground hover:bg-emerald-500/20',
  low: 'border-amber-500/50 bg-amber-500/10 text-foreground hover:bg-amber-500/20',
  'sold-out': 'border-border bg-muted text-muted-foreground line-through hover:bg-muted/70',
}

const STATUS_FIGURE: Record<AllocationStatus, string> = {
  open: 'text-emerald-700 dark:text-emerald-400',
  low: 'text-amber-700 dark:text-amber-400',
  'sold-out': 'text-muted-foreground',
}

function describeCell(row: PresellAllocationRow | undefined, isPast: boolean): string {
  if (isPast) return row ? `${row.sold_qty} sold, past` : 'past'
  if (!row) return 'not offered'
  const remaining = resolvePresellRemaining(row.stock_qty, row.sold_qty)
  return remaining <= 0 ? 'sold out' : `${remaining} left of ${row.stock_qty}`
}

export function PresellAllocationCalendar({
  rows,
  todayKey,
  selectedDate,
  onSelect,
  initialDate,
}: PresellAllocationCalendarProps) {
  const byDate = useMemo(() => new Map(rows.map((r) => [r.presell_date, r])), [rows])
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    monthCursorOf(initialDate ?? selectedDate ?? todayKey),
  )
  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const isAtCurrentMonth =
    cursor.year === monthCursorOf(todayKey).year && cursor.month === monthCursorOf(todayKey).month

  return (
    <div role="group" aria-label="Allocation calendar" className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={isAtCurrentMonth}
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold tabular-nums">{formatMonthTitle(cursor)}</p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        ))}
        {weeks.flat().map((dateKey, index) => {
          if (!dateKey) return <span key={`blank-${index}`} aria-hidden="true" />
          const row = byDate.get(dateKey)
          const isPast = dateKey < todayKey
          const isToday = dateKey === todayKey
          const isSelected = selectedDate === dateKey
          const status = row && !isPast ? describeAllocationStatus(row) : null
          const remaining = row ? resolvePresellRemaining(row.stock_qty, row.sold_qty) : null

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isPast}
              aria-pressed={isSelected}
              aria-label={`${formatPresellDayLabel(dateKey)}, ${describeCell(row, isPast)}`}
              onClick={() => onSelect(dateKey)}
              className={cn(
                'relative flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-medium tabular-nums transition-[background-color,box-shadow,border-color] duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                status ? STATUS_CELL[status] : 'border-transparent hover:border-border hover:bg-muted',
                isPast && 'cursor-not-allowed text-muted-foreground/50 hover:border-transparent hover:bg-transparent',
                isSelected && 'ring-2 ring-foreground ring-offset-1 ring-offset-card',
              )}
            >
              <span className={cn(isToday && !status && 'underline decoration-2 underline-offset-2')}>
                {Number(dateKey.slice(-2))}
              </span>
              {row && !isPast && status && (
                <span className={cn('text-[10px] font-semibold leading-none', STATUS_FIGURE[status])}>
                  {status === 'sold-out' ? 'sold out' : `${remaining}/${row.stock_qty}`}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />Open</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" />Running low</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-muted-foreground/40" />Sold out</span>
        <span className="ml-auto">Tap a day to offer it</span>
      </div>
    </div>
  )
}
