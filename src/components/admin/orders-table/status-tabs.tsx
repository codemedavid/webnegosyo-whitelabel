'use client'

import { cn } from '@/lib/utils'
import { STATUS_META, type OrderStatus } from '@/lib/admin/orders-table/status'
import type { StatusCounts } from '@/lib/admin/orders-table/read-orders-table'

const TAB_ORDER: ReadonlyArray<OrderStatus | 'all'> = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']

function tabLabel(tab: OrderStatus | 'all'): string {
  return tab === 'all' ? 'All' : STATUS_META[tab].label
}

interface StatusTabsProps {
  value: OrderStatus | 'all'
  /** Null hides the numbers (all time, or a backend that cannot count). */
  counts: StatusCounts | null
  onSelect: (tab: OrderStatus | 'all') => void
}

/**
 * The status filter. Buttons, not ARIA tabs: each one reloads the list, and
 * the list below is the same region whichever is chosen.
 */
export function StatusTabs({ value, counts, onSelect }: StatusTabsProps) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <div role="group" aria-label="Filter by status" className="flex w-max gap-1 border-b border-wn-line">
        {TAB_ORDER.map((tab) => {
          const isActive = tab === value
          const count = counts?.[tab]
          const isNewWaiting = tab === 'pending' && typeof count === 'number' && count > 0
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(tab)}
              className={cn(
                '-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-[14px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-wn-ink',
                isActive ? 'border-wn-ink text-wn-ink' : 'border-transparent text-wn-stone hover:text-wn-ink',
              )}
            >
              {tabLabel(tab)}
              {typeof count === 'number' && (
                <span
                  className={cn(
                    'min-w-6 rounded-full px-1.5 py-0.5 text-center text-[12px] font-bold tabular-nums',
                    isNewWaiting ? 'bg-wn-coral text-white' : isActive ? 'bg-wn-ink text-white' : 'bg-wn-sand text-wn-stone',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
