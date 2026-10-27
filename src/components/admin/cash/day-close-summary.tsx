import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { DayCloseSnapshot } from '@/lib/cash/day-close'
import { formatMoney } from './cash-format'

/**
 * The day's frozen figures, as the close (or its preview) reads (06 §4.5):
 * the ink hero "Cash to deposit", then sales from the one sales definition,
 * by shift and by named shift. Presentational, so the print page shows
 * exactly what the screen shows. Unknown figures read "—", never ₱0.
 */

function Line({ label, value, isStrong = false, hint }: { label: string; value: string; isStrong?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={cn('min-w-0 text-[14px] text-wn-ink', isStrong && 'font-bold')}>
        {label}
        {hint && <span className="ml-1.5 text-[12.5px] text-wn-stone">{hint}</span>}
      </span>
      <span className={cn('shrink-0 text-[14px] tabular-nums text-wn-ink', isStrong ? 'font-extrabold' : 'font-semibold')}>{value}</span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1 break-inside-avoid">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-wn-stone">{title}</h3>
      <div className="divide-y divide-wn-line">{children}</div>
    </section>
  )
}

function money(cents: number | null): string {
  return formatMoney(cents, { centavos: true })
}

function differenceWords(cents: number | null): string {
  if (cents === null) return 'Not counted'
  if (cents === 0) return 'Exact'
  return `${cents < 0 ? 'Short' : 'Over'} ${money(Math.abs(cents))}`
}

export function DayCloseSummary({ snapshot, isDrawersOnly }: { snapshot: DayCloseSnapshot; isDrawersOnly: boolean }) {
  const { sales, drawers } = snapshot
  const hasNamedShifts = snapshot.byServicePeriod.length > 0
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-wn-ink px-5 py-4 text-white print:border print:border-black print:bg-white print:text-black">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70 print:text-black">Cash to deposit</p>
        <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums">{money(snapshot.cashToAccountForCents)}</p>
        <p className="mt-1 text-[13px] text-white/75 print:text-black">What the drawers handed over, plus cash picked up during shifts.</p>
      </div>

      {sales ? (
        <Block title="Sales">
          <Line label="Net sales" value={formatMoney(sales.netCents)} hint={`${sales.orders} orders`} isStrong />
          {sales.discountCents !== null && sales.discountCents !== 0 && <Line label="Discounts" value={formatMoney(-sales.discountCents)} />}
          {sales.collectedByMethod.map((method) => (
            <Line key={method.bucket} label={method.bucket} value={formatMoney(method.cents)} />
          ))}
          {sales.unpaidCents !== null && sales.unpaidCents > 0 && <Line label="Still unpaid" value={formatMoney(sales.unpaidCents)} />}
          {sales.overpaidCents !== null && sales.overpaidCents > 0 && <Line label="Overpaid" value={formatMoney(sales.overpaidCents)} />}
        </Block>
      ) : (
        <p className="rounded-xl bg-wn-sand px-4 py-3 text-[13.5px] text-wn-stone ring-1 ring-wn-line">
          {isDrawersOnly
            ? 'Sales for this store are kept outside WebNegosyo’s main database, so this close covers the drawers only.'
            : 'Sales figures need the Reports permission. The drawers below are complete.'}
        </p>
      )}

      {hasNamedShifts && (
        <Block title="By named shift">
          {snapshot.byServicePeriod.map((period) => (
            <Line key={period.periodId ?? period.name} label={period.name} hint={`${period.orders} orders`} value={formatMoney(period.netCents)} />
          ))}
          {snapshot.otherHoursNetCents !== null && snapshot.otherHoursNetCents !== 0 && (
            <Line label="Other hours" value={formatMoney(snapshot.otherHoursNetCents)} />
          )}
        </Block>
      )}

      <Block title="By shift">
        {drawers.shifts.length === 0 ? (
          <p className="py-2 text-[14px] text-wn-stone">No shifts on this day.</p>
        ) : (
          drawers.shifts.map((shift) => (
            <div key={shift.shiftId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
              <span className="min-w-0 text-[14px] text-wn-ink">
                <b>{shift.staff}</b>
                <span className="ml-1.5 text-[12.5px] text-wn-stone">
                  {[shift.drawer, shift.closeKind === 'forced' ? 'ended without a count' : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-right text-[13.5px] tabular-nums text-wn-ink">
                {shift.remittance?.handedOverCents !== null && shift.remittance?.handedOverCents !== undefined
                  ? `Remitted ${money(shift.remittance.handedOverCents)} · `
                  : ''}
                {differenceWords(shift.varianceCents)}
              </span>
            </div>
          ))
        )}
        <Line label="Short / over, all drawers" value={differenceWords(drawers.totals.varianceCents)} isStrong />
      </Block>

      {snapshot.recountChanged.length > 0 && (
        <Block title="Counted twice">
          {snapshot.recountChanged.map((recount) => (
            <Line key={recount.shiftId} label={recount.staffName} value={`${money(recount.firstCents)} → ${money(recount.finalCents)}`} />
          ))}
        </Block>
      )}

      {snapshot.expenses && (snapshot.expenses.drawerCents ?? 0) > 0 && (
        <Block title="Paid from the drawers">
          <Line label="Expenses" value={money(snapshot.expenses.drawerCents)} />
        </Block>
      )}
    </div>
  )
}
