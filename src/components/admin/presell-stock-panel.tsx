'use client'

/**
 * Per-date presell allocations for one menu item, inside the menu item form.
 *
 * A calendar to pick dates on, a list of the dates already promised, and a
 * range helper. Fully controlled: every edit goes to the draft the form holds
 * and nothing is written until "Update Menu Item" is pressed. The panel used
 * to call a server action per click, and because any revalidation in a Server
 * Action re-renders the current route, the editor refreshed under the
 * merchant between every keystroke — see `revalidateMenu` in the action.
 *
 * Only `stockQty` is ever edited. Sold counts move exclusively through orders
 * (apply_presell_order), so this panel can never un-sell; dropping a date
 * with sales is refused before save and again on the server.
 */

import { useMemo, useState } from 'react'
import { CalendarPlus, CalendarRange, ChevronDown, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import { formatPresellDateLong } from '@/lib/presell/month-grid'
import { splitAllocations, summarizeAllocations } from '@/lib/presell/admin-allocations'
import { resolvePresellRemaining } from '@/lib/presell/availability'
import {
  setDraftStock,
  removeDraftDate,
  fillDraftRange,
  isDraftDirty,
  type DraftAllocation,
} from '@/lib/presell/allocation-draft'
import { PresellAllocationCalendar } from '@/components/admin/presell-allocation-calendar'
import { PresellAllocationList, StockStepper } from '@/components/admin/presell-allocation-list'
import { PresellRangeForm } from '@/components/admin/presell-range-form'

interface PresellStockPanelProps {
  /** The dates as the dish was last saved — the baseline unsaved edits show against. */
  savedAllocations: readonly DraftAllocation[]
  /** The dates as the merchant has them now. */
  draft: readonly DraftAllocation[]
  onDraftChange: (next: DraftAllocation[]) => void
  /** Today's business day (Asia/Manila); injectable for tests. */
  todayKey?: string
}

function SummaryFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

/**
 * The shape the calendar, list and summary all read. They were written
 * against the database row, and a draft entry is the same three facts under
 * different names, so it is adapted here rather than duplicating each view.
 */
function toRow(entry: DraftAllocation) {
  return { presell_date: entry.presellDate, stock_qty: entry.stockQty, sold_qty: entry.soldQty }
}

export function PresellStockPanel({
  savedAllocations,
  draft,
  onDraftChange,
  todayKey: todayKeyProp,
}: PresellStockPanelProps) {
  const todayKey = useMemo(
    () => todayKeyProp ?? toBusinessDayKey(new Date().toISOString()),
    [todayKeyProp],
  )
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [newQty, setNewQty] = useState('')
  const [isRangeOpen, setIsRangeOpen] = useState(false)
  const [isPastOpen, setIsPastOpen] = useState(false)

  const rows = useMemo(() => draft.map(toRow), [draft])
  const { upcoming, past } = useMemo(() => splitAllocations(rows, todayKey), [rows, todayKey])
  const summary = useMemo(() => summarizeAllocations(rows, todayKey), [rows, todayKey])
  const selectedRow = selectedDate ? rows.find((r) => r.presell_date === selectedDate) ?? null : null
  const hasUnsavedEdits = useMemo(
    () => isDraftDirty(savedAllocations, draft),
    [savedAllocations, draft],
  )

  const handleAddSelected = () => {
    const qty = Number(newQty)
    if (!selectedDate || newQty === '' || !Number.isInteger(qty) || qty < 0) {
      toast.error('Enter a whole-number stock amount')
      return
    }
    onDraftChange(setDraftStock(draft, selectedDate, qty))
    setNewQty('')
  }

  const handleSetStock = (row: { presell_date: string }, stockQty: number) =>
    onDraftChange(setDraftStock(draft, row.presell_date, stockQty))

  const handleRemove = (row: { presell_date: string; sold_qty: number }) => {
    if (row.sold_qty > 0) {
      toast.error('This date already has orders. Set its stock to the sold count to stop selling more.')
      return
    }
    if (selectedDate === row.presell_date) setSelectedDate(null)
    onDraftChange(removeDraftDate(draft, row.presell_date))
  }

  const handleApplyRange = (dateKeys: string[], stockQty: number) => {
    onDraftChange(fillDraftRange(draft, dateKeys, stockQty))
    setIsRangeOpen(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div role="group" aria-label="Pre-order summary" className="grid grid-cols-4 gap-4 sm:gap-6">
          <SummaryFigure label="Dates" value={summary.upcomingDates} />
          <SummaryFigure label="Offered" value={summary.offered} />
          <SummaryFigure label="Sold" value={summary.sold} />
          <SummaryFigure label="Left" value={summary.remaining} />
        </div>
        {!isRangeOpen && (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsRangeOpen(true)}>
            <CalendarRange className="mr-1.5 h-4 w-4" /> Add several dates
          </Button>
        )}
      </div>

      {/*
        Nothing here is written until the dish is saved, so the panel has to
        say so — otherwise a merchant who adds a date and navigates away loses
        it with no warning, which is the opposite of the bug this replaced.
      */}
      {hasUnsavedEdits && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Unsaved date changes — press &ldquo;Update Menu Item&rdquo; to save them.
        </p>
      )}

      {isRangeOpen && (
        <PresellRangeForm
          rows={rows}
          todayKey={todayKey}
          onApply={handleApplyRange}
          onCancel={() => setIsRangeOpen(false)}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <div className="space-y-3">
          <PresellAllocationCalendar
            rows={rows}
            todayKey={todayKey}
            selectedDate={selectedDate}
            onSelect={(key) => { setSelectedDate(key); setNewQty('') }}
            initialDate={upcoming[0]?.presell_date ?? todayKey}
          />

          {selectedDate && (
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{formatPresellDateLong(selectedDate)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedRow
                      ? `${selectedRow.sold_qty} sold · ${resolvePresellRemaining(selectedRow.stock_qty, selectedRow.sold_qty)} left of ${selectedRow.stock_qty}`
                      : 'Not on offer yet. How many can you make?'}
                  </p>
                </div>
                {selectedRow ? (
                  <StockStepper row={selectedRow} onSetStock={handleSetStock} />
                ) : (
                  /*
                   * A div, not a form. This panel renders inside the menu item
                   * editor's `<form>`, and submit bubbles — so "Add date" was
                   * also submitting the whole dish, which saved every field
                   * and bounced the merchant back to the menu list before the
                   * allocation landed. Enter is handled explicitly instead.
                   */
                  <div
                    className="flex items-center gap-2"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      handleAddSelected()
                    }}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      placeholder="Stock"
                      aria-label={`Stock for ${formatPresellDateLong(selectedDate)}`}
                      className="h-9 w-24"
                      autoFocus
                    />
                    <Button type="button" size="sm" onClick={handleAddSelected} disabled={newQty === ''}>
                      <CalendarPlus className="mr-1.5 h-4 w-4" /> Add date
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
              <CalendarPlus className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-semibold">No dates offered yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Tap a day on the calendar and say how many you can make. Customers will only be able to pre-order the dates you add.
              </p>
            </div>
          ) : (
            <PresellAllocationList
              rows={upcoming}
              selectedDate={selectedDate}
                  onSelect={setSelectedDate}
              onSetStock={handleSetStock}
              onRemove={handleRemove}
            />
          )}

          {past.length > 0 && (
            <div className="rounded-xl border">
              <button
                type="button"
                onClick={() => setIsPastOpen((open) => !open)}
                aria-expanded={isPastOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <span>Past dates ({past.length})</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${isPastOpen ? 'rotate-180' : ''}`} />
              </button>
              {isPastOpen && (
                <ul className="divide-y border-t">
                  {past.map((row) => (
                    <li key={row.presell_date} className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                      <span>{formatPresellDateLong(row.presell_date)}</span>
                      <span className="tabular-nums">{row.sold_qty} sold of {row.stock_qty}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
