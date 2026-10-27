import Link from 'next/link'
import { cashHref, type CashierRange } from '@/lib/cash/cash-page'
import { formatSignedMoney } from '@/lib/reports/format'
import { cn } from '@/lib/utils'
import { stripBars, type CashierTrend } from './cashiers-model'

const BAR_TONES = { over: 'bg-amber-500', short: 'bg-red-700', exact: 'bg-wn-line', none: 'bg-transparent ring-1 ring-inset ring-wn-line' } as const

/** Diverging bars around zero: above = over, below = short; an uncounted shift is an empty box. */
function Strip({ trend }: { trend: CashierTrend }) {
  const bars = stripBars(trend.strip)
  return (
    <div role="img" aria-label={`${trend.name}, last ${trend.strip.length} shifts: ${trend.sentence}`} className="flex h-12 w-48 items-stretch gap-0.5">
      {bars.map((bar, index) => (
        <div key={index} className="flex flex-1 flex-col">
          <div className="flex flex-1 items-end">
            {bar.direction === 'over' && <div className={cn('w-full rounded-t-sm', BAR_TONES.over)} style={{ height: `${Math.max(12, bar.share * 100)}%` }} />}
          </div>
          <div className={cn('h-0.5 w-full', bar.direction === 'exact' ? BAR_TONES.exact : 'bg-wn-line')} />
          <div className="flex flex-1 items-start">
            {bar.direction === 'short' && <div className={cn('w-full rounded-b-sm', BAR_TONES.short)} style={{ height: `${Math.max(12, bar.share * 100)}%` }} />}
            {bar.direction === 'none' && <div className={cn('h-1/3 w-full rounded-sm', BAR_TONES.none)} />}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CashiersView({ trends, range, tenantSlug, branch }: { trends: CashierTrend[]; range: CashierRange; tenantSlug: string; branch: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13.5px] leading-snug text-wn-stone">
          Each bar is one shift: above the line is over, below is short. A pattern to talk about, not a verdict. Shortages are recorded here,
          never taken from anyone’s pay.
        </p>
        <nav aria-label="Look back" className="inline-flex gap-1 rounded-full bg-wn-sand p-1 ring-1 ring-wn-line">
          {([30, 90] as const).map((days) => (
            <Link
              key={days}
              href={cashHref(tenantSlug, { tab: 'cashiers', range: days, branch })}
              aria-current={days === range ? 'page' : undefined}
              className={cn('min-h-9 rounded-full px-3.5 py-2 text-[13.5px] font-bold', days === range ? 'bg-wn-ink text-white' : 'text-wn-ink hover:bg-white')}
            >
              {days} days
            </Link>
          ))}
        </nav>
      </div>
      {trends.length === 0 ? (
        <p className="rounded-2xl bg-white px-5 py-6 text-[14px] text-wn-stone ring-1 ring-border">No shifts in the last {range} days.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-border">
          <table className="w-full min-w-[760px] border-collapse text-left text-[14px] tabular-nums">
            <thead>
              <tr className="border-b border-wn-line text-[12px] font-bold uppercase tracking-[0.08em] text-wn-stone">
                <th scope="col" className="px-4 py-3">Cashier</th>
                <th scope="col" className="px-3 py-3">Last 14 shifts</th>
                <th scope="col" className="px-3 py-3 text-right">Shifts</th>
                <th scope="col" className="px-3 py-3 text-right">Short / over</th>
                <th scope="col" className="px-3 py-3 text-right">Counted twice</th>
                <th scope="col" className="px-4 py-3 text-right">Ended without a count</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((trend) => (
                <tr key={trend.key} className="border-b border-wn-line last:border-b-0 align-middle">
                  <td className="px-4 py-3">
                    <span className="block font-bold text-wn-ink">{trend.name}</span>
                    <span className="block text-[12.5px] text-wn-stone">{trend.sentence}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Strip trend={trend} />
                  </td>
                  <td className="px-3 py-3 text-right text-wn-ink">{trend.summary?.shifts ?? trend.strip.length}</td>
                  <td className="px-3 py-3 text-right font-semibold text-wn-ink">{formatSignedMoney(trend.summary?.overShortCents ?? null, { centavos: true })}</td>
                  <td className="px-3 py-3 text-right text-wn-ink">{trend.recountChanged > 0 ? trend.recountChanged : '—'}</td>
                  <td className="px-4 py-3 text-right text-wn-ink">{trend.summary && trend.summary.forcedCloses > 0 ? trend.summary.forcedCloses : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
