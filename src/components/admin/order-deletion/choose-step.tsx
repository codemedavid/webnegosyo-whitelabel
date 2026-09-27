'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPeso } from '@/lib/outlets/branch-format'
import { cn } from '@/lib/utils'
import type { DeletionMode, OrderDeletionState } from './use-order-deletion'

const MODES: { value: DeletionMode; title: string; description: string }[] = [
  { value: 'range', title: 'Date range', description: 'Every order placed between two dates.' },
  { value: 'selected', title: 'Selected orders', description: 'Pick individual orders from a list.' },
  { value: 'all', title: 'Reset everything', description: 'Every order this store has, for a fresh dashboard.' },
]

function manilaTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function OrderPicker({ state }: { state: OrderDeletionState }) {
  if (!state.listedOrders) return null
  if (state.listedOrders.length === 0) {
    return <p className="text-sm text-muted-foreground">No orders in those dates.</p>
  }
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      {state.listedOrders.map((order) => {
        const checkboxId = `pick-${order.id}`
        return (
          <label
            key={order.id}
            htmlFor={checkboxId}
            className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
          >
            <Checkbox
              id={checkboxId}
              checked={state.selectedIds.has(order.id)}
              onCheckedChange={() => state.toggleSelected(order.id)}
            />
            <span className="w-12 font-medium">#{order.daily_number ?? '—'}</span>
            <span className="w-32 text-muted-foreground">{manilaTime(order.created_at)}</span>
            <span className="flex-1 truncate">{order.customer_name || 'Guest'}</span>
            <span className="text-muted-foreground">{order.status}</span>
            <span className="w-24 text-right tabular-nums">{formatPeso(order.total)}</span>
          </label>
        )
      })}
    </div>
  )
}

export function ChooseStep({ state }: { state: OrderDeletionState }) {
  const needsDates = state.mode !== 'all'
  const canReview = state.mode !== 'selected' || state.selectedIds.size > 0

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What to delete">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={state.mode === option.value}
            onClick={() => state.setMode(option.value)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              state.mode === option.value ? 'border-destructive bg-destructive/5' : 'hover:bg-muted/50'
            )}
          >
            <p className="text-sm font-medium">{option.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
          </button>
        ))}
      </div>

      {needsDates && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="delete-from">From</Label>
            <Input id="delete-from" type="date" value={state.from} max={state.to}
              onChange={(event) => state.setFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="delete-to">To</Label>
            <Input id="delete-to" type="date" value={state.to} min={state.from}
              onChange={(event) => state.setTo(event.target.value)} />
          </div>
          {state.mode === 'selected' && (
            <Button type="button" variant="outline" onClick={state.loadOrdersToPick} disabled={state.busy}>
              Show orders
            </Button>
          )}
        </div>
      )}

      {state.mode === 'selected' && <OrderPicker state={state} />}

      <label htmlFor="include-active" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="include-active"
          checked={state.includeActive}
          onCheckedChange={(checked) => state.setIncludeActive(checked === true)}
        />
        <span>
          Also delete orders that are still in progress (pending, confirmed, preparing or ready).
          <span className="block text-xs text-muted-foreground">
            Leave this off unless those orders are tests — a customer may still be waiting on them.
          </span>
        </span>
      </label>

      {state.preview && state.preview.orderCount === 0 && (
        <p className="text-sm text-muted-foreground">No orders match. Nothing would be deleted.</p>
      )}

      <Button type="button" onClick={state.reviewScope} disabled={state.busy || !canReview}>
        {state.busy ? 'Checking…' : 'Review what will be deleted'}
      </Button>
    </div>
  )
}
