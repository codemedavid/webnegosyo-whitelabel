'use client'

/**
 * Fill a run of dates with one stock figure. The plan is previewed before
 * anything saves — how many new dates, how many existing ones get their
 * stock replaced, how many past days are ignored — so the button says
 * exactly what it will do.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { planRangeAllocation } from '@/lib/presell/admin-allocations'
import { MAX_RANGE_DAYS } from '@/lib/presell/month-grid'
import type { PresellAllocationRow } from '@/lib/presell/availability'

interface PresellRangeFormProps {
  rows: readonly PresellAllocationRow[]
  todayKey: string
  isBusy: boolean
  onApply: (dateKeys: string[], stockQty: number) => Promise<void>
  onCancel: () => void
}

export function PresellRangeForm({ rows, todayKey, isBusy, onApply, onCancel }: PresellRangeFormProps) {
  const [from, setFrom] = useState(todayKey)
  const [to, setTo] = useState('')
  const [qty, setQty] = useState('')

  const plan = from && to ? planRangeAllocation(rows, from, to, todayKey) : null
  const targets = plan ? [...plan.toCreate, ...plan.toOverwrite] : []
  const stock = Number(qty)
  const isValid = targets.length > 0 && qty !== '' && Number.isInteger(stock) && stock >= 0

  return (
    <form
      className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (isValid) void onApply(targets, stock)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="presell-range-from" className="text-xs">From</Label>
          <Input id="presell-range-from" type="date" min={todayKey} value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="presell-range-to" className="text-xs">To</Label>
          <Input id="presell-range-to" type="date" min={from || todayKey} value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="presell-range-qty" className="text-xs">Stock per date</Label>
          <Input id="presell-range-qty" type="number" inputMode="numeric" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 20" className="h-9" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {!plan
          ? `Pick a start and end date (up to ${MAX_RANGE_DAYS} days).`
          : targets.length === 0
            ? 'That range has no upcoming dates.'
            : [
                `${plan.toCreate.length} new`,
                plan.toOverwrite.length > 0 ? `${plan.toOverwrite.length} existing (stock will be replaced)` : null,
                plan.skippedPast.length > 0 ? `${plan.skippedPast.length} past day${plan.skippedPast.length === 1 ? '' : 's'} skipped` : null,
              ].filter(Boolean).join(' · ')}
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isBusy}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!isValid || isBusy}>
          {targets.length > 0 ? `Apply to ${targets.length} date${targets.length === 1 ? '' : 's'}` : 'Apply'}
        </Button>
      </div>
    </form>
  )
}
