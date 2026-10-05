import { Footprints, Repeat2, UserPlus, UsersRound, type LucideIcon } from 'lucide-react'
import type { CustomerPeriod } from '@/lib/growth/customer-summary'
import { formatCount, formatPeso, formatPercent } from './dashboard-format'
import { DashCard } from './dash-card'
import { METRIC_STYLES, WALK_IN_STYLE, type MetricStyle } from './metric-style'

interface BuyerRow {
  key: string
  label: string
  detail: string
  sales: number
  icon: LucideIcon
  style: MetricStyle
}

function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0
}

function count(value: number, one: string, many: string): string {
  return `${formatCount(value)} ${value === 1 ? one : many}`
}

/** Sales split by who paid: returning, new, and walk-ins who left no number. Always adds up. */
export function WhoIsBuyingCard({ current, className }: { current: CustomerPeriod; className?: string }) {
  const rows: BuyerRow[] = [
    {
      key: 'returning',
      label: 'Returning',
      detail: count(current.returningCustomers, 'person', 'people'),
      sales: current.returningCustomerSales,
      icon: Repeat2,
      style: METRIC_STYLES.returningCustomers,
    },
    {
      key: 'new',
      label: 'New',
      detail: count(current.newCustomers, 'person', 'people'),
      sales: current.newCustomerSales,
      icon: UserPlus,
      style: METRIC_STYLES.newCustomers,
    },
    {
      key: 'walk-in',
      label: 'Walk-ins',
      detail: `${count(current.walkInOrders, 'order', 'orders')}, no number`,
      sales: current.walkInSales,
      icon: Footprints,
      style: WALK_IN_STYLE,
    },
  ]

  return (
    <DashCard
      title="Who's buying"
      icon={UsersRound}
      className={className}
      aside={<span className="text-[12.5px] font-semibold text-muted-foreground">{formatPeso(current.sales)}</span>}
    >
      {current.sales > 0 ? (
        <div className="space-y-4">
          <div
            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={rows.map((row) => `${row.label} ${formatPercent(share(row.sales, current.sales))}`).join(', ')}
          >
            {rows
              .filter((row) => row.sales > 0)
              .map((row) => (
                <div
                  key={row.key}
                  className="h-full"
                  style={{ width: `${share(row.sales, current.sales)}%`, backgroundColor: row.style.color }}
                />
              ))}
          </div>
          <ul className="space-y-3">
            {rows.map((row) => {
              const Icon = row.icon
              return (
                <li key={row.key} className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: row.style.wash, color: row.style.ink }}
                    aria-hidden
                  >
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold">{row.label}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{row.detail}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[14px] font-extrabold tabular-nums">{formatPeso(row.sales)}</span>
                    <span className="block text-[12.5px] tabular-nums text-muted-foreground">
                      {formatPercent(share(row.sales, current.sales))}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl bg-wn-sand px-4 py-6 text-center text-[13.5px] text-muted-foreground">No sales in this period yet.</p>
      )}
    </DashCard>
  )
}
