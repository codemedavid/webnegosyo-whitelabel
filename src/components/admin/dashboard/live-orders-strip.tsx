import Link from 'next/link'
import { ArrowRight, BellRing, ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrderStats } from '@/lib/order-stats'
import { formatCount, formatPeso } from './dashboard-format'

interface LiveOrdersStripProps {
  stats: OrderStats | null
  ordersHref: string
}

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3CC48D] opacity-60 motion-reduce:hidden" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3CC48D]" />
    </span>
  )
}

/** One slim line for the kitchen queue; it turns amber when new orders are waiting to be accepted. */
export function LiveOrdersStrip({ stats, ordersHref }: LiveOrdersStripProps) {
  const waiting = stats?.pendingOrders ?? 0
  const inProgress = stats
    ? stats.pendingOrders + stats.confirmedOrders + stats.preparingOrders + stats.readyOrders
    : 0
  const hasWaiting = waiting > 0
  const Icon = hasWaiting ? BellRing : ChefHat

  return (
    <Link
      href={ordersHref}
      className={cn(
        'group flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-5',
        hasWaiting ? 'bg-amber-50 ring-amber-300 hover:bg-amber-100' : 'bg-white ring-border hover:bg-wn-sand',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          hasWaiting ? 'bg-amber-200/70 text-amber-900' : 'bg-wn-sand text-foreground',
        )}
        aria-hidden
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        {stats ? (
          <>
            <span className="flex items-center gap-2 text-[14px] font-bold">
              <LivePulse />
              {hasWaiting
                ? `${formatCount(waiting)} new ${waiting === 1 ? 'order' : 'orders'} waiting`
                : `${formatCount(inProgress)} ${inProgress === 1 ? 'order' : 'orders'} in progress`}
            </span>
            <span className="block truncate text-[12.5px] text-muted-foreground">
              {hasWaiting && `${formatCount(inProgress)} in progress · `}
              {formatCount(stats.todayOrders)} placed today · {formatPeso(stats.todayRevenue)}
            </span>
          </>
        ) : (
          <span className="text-[14px] font-semibold">Live orders couldn&apos;t be read right now.</span>
        )}
      </span>
      <span className="hidden items-center gap-1 text-[13px] font-bold sm:inline-flex">
        Open orders
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 sm:hidden" aria-hidden />
    </Link>
  )
}
