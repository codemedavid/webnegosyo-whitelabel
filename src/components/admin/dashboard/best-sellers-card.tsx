import { Trophy } from 'lucide-react'
import type { TopItem } from '@/lib/dashboard/overview'
import { formatCount, formatPeso } from './dashboard-format'
import { DashCard } from './dash-card'

/** Five rows is a glance; the full list lives on Product Analytics. */
const SHOWN = 5

/** Top dishes by money made, ranked. */
export function BestSellersCard({ items, className }: { items: TopItem[] | null; className?: string }) {
  const rows = (items ?? []).slice(0, SHOWN)
  return (
    <DashCard title="Best sellers" icon={Trophy} className={className}>
      {rows.length > 0 ? (
        <ol className="space-y-2.5">
          {rows.map((item, i) => (
            <li key={item.key} className="flex items-center gap-3">
              <span
                className={
                  i === 0
                    ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wn-ink text-[12px] font-extrabold text-white'
                    : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wn-sand text-[12px] font-extrabold text-muted-foreground'
                }
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{item.name}</span>
                <span className="block text-[12.5px] text-muted-foreground">{formatCount(item.quantity)} sold</span>
              </span>
              <span className="text-[14px] font-extrabold tabular-nums">{formatPeso(item.revenue)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl bg-wn-sand px-4 py-6 text-center text-[13.5px] text-muted-foreground">
          {items === null ? 'Dish sales could not be read right now.' : 'No dishes sold in this period yet.'}
        </p>
      )}
    </DashCard>
  )
}
