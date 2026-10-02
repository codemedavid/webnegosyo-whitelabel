import { Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BasketSummary } from '@/lib/boost/order-baskets'
import type { PairStrength } from '@/lib/boost/pair-insights'
import type { BoostItem } from '@/lib/boost/workspace'
import { DishPhoto } from './dish'

const INITIAL_ROWS = 6

const STRENGTH: Record<PairStrength, { label: string; className: string }> = {
  always: { label: 'Almost always', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  often: { label: 'Often', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  sometimes: { label: 'Sometimes', className: 'bg-muted text-muted-foreground' },
}

interface PickedTogetherProps {
  summary: BasketSummary
  items: readonly BoostItem[]
  className?: string
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function emptyMessage(summary: BasketSummary): string | null {
  if (!summary.isAvailable) return summary.note ?? 'Your order history could not be read right now.'
  if (summary.orderCount === 0) return 'No orders yet. Once customers start ordering, the dishes they buy together show up here.'
  if (summary.pairs.length === 0) {
    return 'No strong patterns yet — no two dishes are ordered together more often than chance. Check back after more orders.'
  }
  return null
}

/**
 * "What do customers always order together?" — the strongest pairs from real
 * baskets, each with how often it happens and how far above chance it is.
 * Server-rendered; the extra rows open with a native disclosure.
 */
export function PickedTogether({ summary, items, className }: PickedTogetherProps) {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const pairs = summary.pairs.filter((pair) => itemsById.has(pair.anchorId) && itemsById.has(pair.partnerId))
  const message = emptyMessage({ ...summary, pairs })

  const rows = pairs.map((pair) => {
    const anchor = itemsById.get(pair.anchorId) as BoostItem
    const partner = itemsById.get(pair.partnerId) as BoostItem
    const strength = STRENGTH[pair.strength]
    return (
      <li key={`${pair.anchorId}|${pair.partnerId}`} className="flex items-center gap-3 py-3">
        <span className="flex shrink-0 -space-x-2">
          <DishPhoto item={anchor} size="sm" className="ring-2 ring-background" />
          <DishPhoto item={partner} size="sm" className="ring-2 ring-background" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{anchor.name} + {partner.name}</span>
          <span className="block text-xs text-muted-foreground">
            {partner.name} is in {percent(pair.share)} of {anchor.name} orders · {pair.together.toLocaleString('en-PH')} orders together
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', strength.className)}>{strength.label}</span>
          <span className="text-[11px] text-muted-foreground" title="How much more often than chance">
            {pair.lift.toFixed(1)}× chance
          </span>
        </span>
      </li>
    )
  })

  return (
    <section aria-labelledby="picked-together-title" className={cn('rounded-2xl border bg-card p-4 sm:p-5', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="picked-together-title" className="text-base font-semibold">Picked together</h2>
          <p className="text-sm text-muted-foreground">
            {summary.isAvailable && summary.orderCount > 0
              ? `What customers order together, from ${summary.orderCount.toLocaleString('en-PH')} orders (${summary.windowLabel}).`
              : 'What customers order together, from your real orders.'}
          </p>
        </div>
      </div>

      {message ? (
        <p className="mt-4 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{message}</p>
      ) : (
        <>
          <ul className="mt-2 divide-y">{rows.slice(0, INITIAL_ROWS)}</ul>
          {rows.length > INITIAL_ROWS && (
            <details className="group">
              <summary className="cursor-pointer list-none py-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
                <span className="group-open:hidden">Show {rows.length - INITIAL_ROWS} more pairs</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <ul className="divide-y border-t">{rows.slice(INITIAL_ROWS)}</ul>
            </details>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            “× chance” compares how often two dishes meet with how often they would if customers picked at random. Above 1 is a real habit.
          </p>
        </>
      )}
    </section>
  )
}
