'use client'

/**
 * Per-date presell allocations for one menu item, inside the menu item form.
 *
 * A calendar to pick dates on, a list of the dates already promised, and a
 * range helper. Only `stock_qty` is ever written — sold counts move
 * exclusively through orders (apply_presell_order), so this panel can never
 * un-sell. Deleting a date with sales is refused server-side; the merchant
 * lowers stock to the sold count instead.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { CalendarPlus, CalendarRange, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getPresellStockAction,
  savePresellAllocationAction,
  deletePresellAllocationAction,
} from '@/app/actions/presell'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import { formatPresellDateLong } from '@/lib/presell/month-grid'
import { splitAllocations, summarizeAllocations } from '@/lib/presell/admin-allocations'
import { resolvePresellRemaining } from '@/lib/presell/availability'
import { PresellAllocationCalendar } from '@/components/admin/presell-allocation-calendar'
import { PresellAllocationList, StockStepper } from '@/components/admin/presell-allocation-list'
import { PresellRangeForm } from '@/components/admin/presell-range-form'
import type { PresellStock } from '@/types/database'

interface PresellStockPanelProps {
  tenantId: string
  tenantSlug: string
  menuItemId: string
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

export function PresellStockPanel({ tenantId, tenantSlug, menuItemId, todayKey: todayKeyProp }: PresellStockPanelProps) {
  const todayKey = useMemo(() => todayKeyProp ?? toBusinessDayKey(new Date().toISOString()), [todayKeyProp])
  const [rows, setRows] = useState<PresellStock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [newQty, setNewQty] = useState('')
  const [isRangeOpen, setIsRangeOpen] = useState(false)
  const [isPastOpen, setIsPastOpen] = useState(false)

  const reload = useCallback(async () => {
    const result = await getPresellStockAction(tenantId, menuItemId)
    if (result.success && result.data) {
      setRows(result.data)
    } else if (result.error) {
      toast.error(result.error)
    }
    setIsLoading(false)
  }, [tenantId, menuItemId])

  useEffect(() => {
    void reload()
  }, [reload])

  const { upcoming, past } = useMemo(() => splitAllocations(rows, todayKey), [rows, todayKey])
  const summary = useMemo(() => summarizeAllocations(rows, todayKey), [rows, todayKey])
  const selectedRow = selectedDate ? rows.find((r) => r.presell_date === selectedDate) ?? null : null

  const saveAllocation = async (presellDate: string, stockQty: number): Promise<boolean> => {
    const result = await savePresellAllocationAction(tenantId, tenantSlug, { menuItemId, presellDate, stockQty })
    if (!result.success) {
      toast.error(result.error || 'Failed to save presell date')
      return false
    }
    return true
  }

  const withSaving = async (work: () => Promise<void>) => {
    setIsSaving(true)
    try {
      await work()
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddSelected = () =>
    withSaving(async () => {
      const qty = Number(newQty)
      if (!selectedDate || newQty === '' || !Number.isInteger(qty) || qty < 0) {
        toast.error('Enter a whole-number stock amount')
        return
      }
      if (await saveAllocation(selectedDate, qty)) {
        setNewQty('')
        toast.success(`${formatPresellDateLong(selectedDate)} is now on offer`)
        await reload()
      }
    })

  const handleSetStock = (row: PresellStock, stockQty: number) =>
    withSaving(async () => {
      if (stockQty < 0 || stockQty === row.stock_qty) return
      if (await saveAllocation(row.presell_date, stockQty)) await reload()
    })

  const handleRemove = (row: PresellStock) =>
    withSaving(async () => {
      const result = await deletePresellAllocationAction(tenantId, tenantSlug, { menuItemId, presellDate: row.presell_date })
      if (!result.success) {
        toast.error(result.error || 'Failed to remove presell date')
        return
      }
      if (selectedDate === row.presell_date) setSelectedDate(null)
      toast.success('Date removed')
      await reload()
    })

  const handleApplyRange = (dateKeys: string[], stockQty: number) =>
    withSaving(async () => {
      let saved = 0
      for (const key of dateKeys) {
        if (!(await saveAllocation(key, stockQty))) break
        saved += 1
      }
      if (saved > 0) {
        toast.success(`${saved} date${saved === 1 ? '' : 's'} set to ${stockQty} each`)
        setIsRangeOpen(false)
        await reload()
      }
    })

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading pre-order dates">
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    )
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
          <Button type="button" variant="outline" size="sm" onClick={() => setIsRangeOpen(true)} disabled={isSaving}>
            <CalendarRange className="mr-1.5 h-4 w-4" /> Add several dates
          </Button>
        )}
      </div>

      {isRangeOpen && (
        <PresellRangeForm rows={rows} todayKey={todayKey} isBusy={isSaving} onApply={handleApplyRange} onCancel={() => setIsRangeOpen(false)} />
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
                  <StockStepper row={selectedRow} isBusy={isSaving} onSetStock={handleSetStock} />
                ) : (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); void handleAddSelected() }}
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
                    <Button type="submit" size="sm" disabled={isSaving || newQty === ''}>
                      <CalendarPlus className="mr-1.5 h-4 w-4" /> Add date
                    </Button>
                  </form>
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
              isBusy={isSaving}
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
