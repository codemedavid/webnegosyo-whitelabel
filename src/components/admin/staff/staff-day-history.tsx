import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import { classifyEvent, type OrderActivityKind, type OrderStatusEvent } from '@/lib/staff-activity/order-event'
import type { DayActivity } from '@/lib/staff-activity/staff-profile'
import { formatClock, formatDayLabel } from '@/lib/staff-activity/staff-format'
import { formatShiftLength, shiftDurationMs } from '@/lib/staff-activity/shift-summary'

/**
 * What this person did, day by day.
 *
 * A flat list of events answers "what happened at 3:14pm", which nobody asks.
 * The day is the unit an owner thinks in — "was Tuesday quiet, and who was
 * on?" — so each day leads with its own totals and the drawer that was open,
 * and the individual acts sit underneath for when the totals raise a question.
 */

const KIND_STYLE: Record<OrderActivityKind, { label: string; className: string }> = {
  pos_sale: { label: 'POS sale', className: 'border-transparent bg-sky-100 text-sky-700' },
  confirmed: { label: 'Confirmed', className: 'border-transparent bg-emerald-100 text-emerald-700' },
  completed: { label: 'Completed', className: 'border-transparent bg-violet-100 text-violet-700' },
  cancelled: { label: 'Cancelled', className: 'border-transparent bg-rose-100 text-rose-700' },
  progressed: { label: 'Moved', className: 'border-transparent bg-muted text-muted-foreground' },
}

/** The last six characters of the order id — what a receipt shows. */
function orderRef(event: OrderStatusEvent): string {
  return `#${event.externalOrderId.slice(-6).toUpperCase()}`
}

function daySummary(day: DayActivity): string {
  const parts = [
    day.posSales > 0 ? `${day.posSales} rang up (${formatPrice(day.posSalesTotal)})` : null,
    day.confirmed > 0 ? `${day.confirmed} confirmed` : null,
    day.completed > 0 ? `${day.completed} completed` : null,
    day.cancelled > 0 ? `${day.cancelled} cancelled` : null,
    day.progressed > 0 ? `${day.progressed} moved` : null,
  ].filter(Boolean) as string[]

  return parts.length === 0 ? 'On shift, no orders handled' : parts.join(' · ')
}

export interface StaffDayHistoryProps {
  days: readonly DayActivity[]
  nowIso: string
  nowMs: number
  /** True when the window's rows hit the page ceiling upstream. */
  isTruncated?: boolean
}

export function StaffDayHistory({ days, nowIso, nowMs, isTruncated = false }: StaffDayHistoryProps) {
  if (days.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Nothing recorded in this period. Orders they ring up, confirm or complete will appear here.
      </p>
    )
  }

  return (
    <div className="space-y-4" data-testid="staff-day-history">
      {isTruncated && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This period has more activity than one page holds. The oldest days are not shown — pick a
          shorter period.
        </p>
      )}

      {days.map((day) => (
        <section key={day.dayKey} data-testid={`staff-day-${day.dayKey}`} className="rounded-xl border">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/30 px-4 py-3">
            <h3 className="text-sm font-semibold">{formatDayLabel(day.dayKey, nowIso)}</h3>
            <p className="text-xs text-muted-foreground">{daySummary(day)}</p>
          </header>

          {day.shifts.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b px-4 py-2">
              {day.shifts.map((shift) => (
                <Badge key={shift.id} variant="outline" className="text-xs font-normal">
                  {formatClock(shift.openedAt)} →{' '}
                  {shift.closedAt ? formatClock(shift.closedAt) : 'now'} ·{' '}
                  {formatShiftLength(shiftDurationMs(shift, nowMs))}
                </Badge>
              ))}
            </div>
          )}

          {day.events.length > 0 && (
            <ul className="divide-y text-sm">
              {day.events.map((event) => {
                const style = KIND_STYLE[classifyEvent(event)]
                return (
                  <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge className={`${style.className} hover:${style.className}`}>{style.label}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{orderRef(event)}</span>
                      {event.source === 'online' && (
                        <span className="text-xs text-muted-foreground">web order</span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {event.orderTotal !== null ? `${formatPrice(event.orderTotal)} · ` : ''}
                      {formatClock(event.occurredAt)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
