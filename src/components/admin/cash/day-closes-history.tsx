import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cashHref } from '@/lib/cash/cash-page'
import type { DayClose } from '@/lib/cash/day-close'
import { dayLabel, formatMoney } from './cash-format'

/** Recent closes, newest first; a reopened version stays listed (struck as "Reopened"). */
export function DayClosesHistory({ closes, tenantSlug, today, outletNames }: { closes: DayClose[]; tenantSlug: string; today: string; outletNames: Record<string, string> }) {
  if (closes.length === 0) {
    return <p className="rounded-2xl bg-white px-5 py-6 text-[14px] text-wn-stone ring-1 ring-border">No days closed in the last 30 days.</p>
  }
  return (
    <ul className="divide-y divide-wn-line overflow-hidden rounded-2xl bg-white ring-1 ring-border">
      {closes.map((close) => (
        <li key={close.id}>
          <Link
            href={cashHref(tenantSlug, { tab: 'days', day: close.businessDay, today, branch: close.outletId })}
            className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-wn-sand/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wn-ink"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold text-wn-ink">
                {dayLabel(close.businessDay)}
                {close.outletId && outletNames[close.outletId] && <span className="ml-2 text-[12.5px] font-semibold text-wn-stone">{outletNames[close.outletId]}</span>}
              </span>
              <span className="block text-[13px] text-wn-stone">
                {close.status === 'reopened' ? `Reopened${close.reopenReason ? ` · ${close.reopenReason}` : ''}` : `Closed by ${close.closedByName}`}
                {close.version > 1 ? ` · version ${close.version}` : ''}
              </span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block text-[14.5px] font-extrabold text-wn-ink">{formatMoney(close.snapshot.cashToAccountForCents, { centavos: true })}</span>
              <span className="block text-[12.5px] text-wn-stone">
                {close.depositRecordedAt ? `Deposited ${formatMoney(close.depositCents, { centavos: true })}` : close.status === 'closed' ? 'No deposit yet' : ''}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-wn-stone" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}
