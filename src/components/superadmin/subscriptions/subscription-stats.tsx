/**
 * The headline figures above the collections table.
 *
 * Money on the first row, head-counts on the second. Money received (the
 * ledger), money expected (MRR), money owed (overdue) and money leaking
 * (trading without paying) are four different numbers and never blended.
 */

import { DUE_SOON_WINDOW_DAYS, type RosterSummary } from '@/lib/billing/subscription-roster'
import type { CollectionsSummary } from '@/lib/billing/collections-insight'
import type { MonthCollection } from '@/lib/billing/payment-history'
import { Panel } from '@/components/superadmin/ui/primitives'

const peso = (value: number) => `₱${value.toLocaleString('en-PH')}`

function monthName(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    month: 'long',
  })
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  testId,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn' | 'good'
  testId?: string
}) {
  const valueTone =
    tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-400' : 'text-white'
  return (
    <Panel hover padding="p-5" testId={testId}>
      <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-white/55">{hint}</p>}
    </Panel>
  )
}

interface SubscriptionStatsProps {
  summary: RosterSummary
  collections?: CollectionsSummary
  collected?: MonthCollection
}

export function SubscriptionStats({ summary, collections, collected }: SubscriptionStatsProps) {
  const isActivityKnown = collections?.isActivityKnown ?? false

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {collected && (
          <Stat
            label={`Collected in ${monthName(collected.monthKey)}`}
            value={peso(collected.amountPhp)}
            hint={`${collected.count} ${collected.count === 1 ? 'payment' : 'payments'} recorded`}
            tone="good"
            testId="stat-collected"
          />
        )}
        <Stat label="MRR" value={peso(summary.mrrPhp)} hint={`${summary.active} paid-up clients`} />
        <Stat
          label="Outstanding"
          value={peso(summary.overduePhp)}
          hint={`${summary.inGrace + summary.paused} past their paid-through date`}
          tone={summary.overduePhp > 0 ? 'warn' : 'default'}
        />
        {isActivityKnown && collections && (
          <Stat
            label="Trading, not paid"
            value={String(collections.tradingUnpaid)}
            hint={`took orders in 30 days · ${peso(collections.tradingUnpaidPhp)}/mo`}
            tone={collections.tradingUnpaid > 0 ? 'warn' : 'default'}
            testId="stat-trading-unpaid"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Paying" value={String(summary.active)} />
        <Stat
          label={`Due in ${DUE_SOON_WINDOW_DAYS}d`}
          value={String(summary.dueSoon)}
          testId="stat-due-soon"
        />
        <Stat label="In grace" value={String(summary.inGrace)} />
        <Stat label="Paused / lapsed" value={String(summary.paused)} />
        <Stat
          label="Not billed"
          value={String(summary.unbilled)}
          hint="no paid-through date set"
          testId="stat-unbilled"
        />
      </div>
    </div>
  )
}
