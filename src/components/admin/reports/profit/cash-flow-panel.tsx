import { ArrowDownLeft, ArrowUpRight, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/reports/format'
import type { CashFlow } from '@/lib/reports/profit-model'
import { CASH_OUT_LABELS } from '@/lib/reports/profit-view'

/**
 * Money in (collected) vs money out (every recorded expense, stock purchases,
 * big purchases and owner draws included). This is where purchases show.
 */
export function CashFlowPanel({ cashFlow }: { cashFlow: CashFlow }) {
  const lines = cashFlow.out.filter((line) => line.cents !== 0)
  const isNegative = cashFlow.netCents < 0
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-border">
          <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            <ArrowDownLeft className="size-4" aria-hidden />
            Money in (collected)
          </dt>
          <dd className="mt-1 text-[26px] font-extrabold text-wn-ink tabular-nums">{formatMoney(cashFlow.inCents)}</dd>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-border">
          <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            <ArrowUpRight className="size-4" aria-hidden />
            Money out (recorded)
          </dt>
          <dd className="mt-1 text-[26px] font-extrabold text-wn-ink tabular-nums">{formatMoney(cashFlow.outCents)}</dd>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-border">
          <dt className={cn('flex items-center gap-1.5 text-[13px] font-semibold', isNegative ? 'text-red-700' : 'text-muted-foreground')}>
            {isNegative && <TriangleAlert className="size-4 shrink-0" aria-hidden />}
            {isNegative ? 'More went out than came in' : 'Left over'}
          </dt>
          <dd className={cn('mt-1 text-[26px] font-extrabold tabular-nums', isNegative ? 'text-red-700' : 'text-wn-ink')}>
            {formatMoney(cashFlow.netCents)}
          </dd>
        </div>
      </dl>
      <section aria-label="Where money went out" className="rounded-2xl bg-white p-4 ring-1 ring-border sm:p-5">
        <h2 className="text-[15px] font-extrabold text-wn-ink">Money out</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted-foreground">Nothing recorded for this period.</p>
        ) : (
          <dl className="mt-2 divide-y divide-wn-line">
            {lines.map((line) => (
              <div key={line.key} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-[14px] text-wn-ink">{CASH_OUT_LABELS[line.key]}</dt>
                <dd className="text-[14px] font-bold text-wn-ink tabular-nums">{formatMoney(line.cents)}</dd>
              </div>
            ))}
          </dl>
        )}
        {cashFlow.unsortedPayouts > 0 && (
          <p className="mt-3 text-[12.5px] leading-snug text-muted-foreground tabular-nums">
            Also out of the drawer, not sorted yet: {cashFlow.unsortedPayouts} pay-out{cashFlow.unsortedPayouts === 1 ? '' : 's'} ·{' '}
            {formatMoney(cashFlow.unsortedPayoutCents)}.
          </p>
        )}
      </section>
    </div>
  )
}
