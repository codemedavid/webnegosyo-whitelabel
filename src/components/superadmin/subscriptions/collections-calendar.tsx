'use client'

/**
 * The collections calendar: a month grid of due dates beside the "ask now"
 * list. Picking a day lists everyone due (or paid) that day underneath.
 *
 * Everything here is presentation over `buildCollectionsCalendar`; the verdicts
 * (late, due today, first payment, dormant) are decided in the pure module.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  CalendarDay,
  CalendarEntry,
  CalendarEntryKind,
  CollectionsCalendar,
} from '@/lib/billing/collections-calendar'
import { formatDueDay } from '@/lib/billing/payment-reminder'
import { MarkPaidDialog } from '@/components/superadmin/mark-paid-dialog'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { Stat } from '@/components/superadmin/subscriptions/subscription-stats'
import {
  CollectionsEntry,
  KIND_DOT,
  KIND_FILL,
  KIND_INK,
} from '@/components/superadmin/subscriptions/collections-entry'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CHIPS_PER_DAY = 3

const LEGEND: ReadonlyArray<readonly [CalendarEntryKind, string]> = [
  ['overdue', 'Late'],
  ['due_today', 'Due today'],
  ['upcoming', 'Upcoming'],
  ['paid', 'Paid'],
]

const peso = (value: number) => `₱${value.toLocaleString('en-PH')}`

const NAV_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-full border border-white/15 px-3 text-sm text-white/75 transition-colors hover:border-white/30 hover:text-white'

interface CollectionsCalendarViewProps {
  calendar: CollectionsCalendar
  monthLabel: string
  prevHref: string
  nextHref: string
  todayHref: string
  isCurrentMonth: boolean
  todayKey: string
}

export function CollectionsCalendarView({
  calendar,
  monthLabel,
  prevHref,
  nextHref,
  todayHref,
  isCurrentMonth,
  todayKey,
}: CollectionsCalendarViewProps) {
  const router = useRouter()
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(
    isCurrentMonth ? todayKey : null
  )
  const [payTarget, setPayTarget] = useState<CalendarEntry | null>(null)

  const selectedDay = calendar.weeks.flat().find((day) => day.dayKey === selectedDayKey) ?? null
  const { totals } = calendar

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Ask today"
          value={String(calendar.askNow.length)}
          hint="Due today, late, or trading unbilled"
          tone={calendar.askNow.length > 0 ? 'warn' : 'good'}
        />
        <Stat
          label={`Still to collect · ${monthLabel}`}
          value={peso(totals.duePhp)}
          hint={`${totals.dueCount} due date${totals.dueCount === 1 ? '' : 's'} not yet paid`}
        />
        <Stat
          label="Already late this month"
          value={peso(totals.overduePhp)}
          hint={`${totals.overdueCount} subscriber${totals.overdueCount === 1 ? '' : 's'}`}
          tone={totals.overdueCount > 0 ? 'warn' : 'default'}
        />
        <Stat
          label="Paid this month"
          value={peso(totals.paidPhp)}
          hint={`${totals.paidCount} payment${totals.paidCount === 1 ? '' : 's'} recorded`}
          tone="good"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel padding="p-4 sm:p-6" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-white">{monthLabel}</h2>
            <div className="flex items-center gap-2">
              <Link href={prevHref} className={NAV_BUTTON} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              {!isCurrentMonth && (
                <Link href={todayHref} className={NAV_BUTTON}>
                  Today
                </Link>
              )}
              <Link href={nextHref} className={NAV_BUTTON} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
            {LEGEND.map(([kind, label]) => (
              <span key={kind} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${KIND_DOT[kind]}`} />
                {label}
              </span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-white/40">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="py-1">
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendar.weeks.flat().map((day) => (
              <DayCell
                key={day.dayKey}
                day={day}
                isSelected={day.dayKey === selectedDayKey}
                onSelect={() => setSelectedDayKey(day.dayKey)}
              />
            ))}
          </div>

          <DayDetail day={selectedDay} onMarkPaid={setPayTarget} />
        </Panel>

        <div className="space-y-6">
          <Panel padding="p-4 sm:p-6">
            <SectionHeader
              title="Ask for payment now"
              subtitle="Due today, then late (longest first), then stores trading with no billing."
            />
            {calendar.askNow.length === 0 ? (
              <p className="mt-4 text-sm text-white/55">Nobody to chase today.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {calendar.askNow.map((entry) => (
                  <CollectionsEntry key={entry.key} entry={entry} onMarkPaid={setPayTarget} />
                ))}
              </ul>
            )}
          </Panel>

          {calendar.dormantOwing.length > 0 && (
            <Panel padding="p-4 sm:p-6">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-white/70 hover:text-white">
                  Late but not trading ({calendar.dormantOwing.length})
                </summary>
                <p className="mt-2 text-xs text-white/45">
                  No orders in 30 days. Worth a check-in, or cancelling, rather than a payment
                  reminder.
                </p>
                <ul className="mt-3 space-y-2">
                  {calendar.dormantOwing.map((entry) => (
                    <CollectionsEntry key={entry.key} entry={entry} onMarkPaid={setPayTarget} />
                  ))}
                </ul>
              </details>
            </Panel>
          )}
        </div>
      </div>

      {payTarget && (
        <MarkPaidDialog
          tenantId={payTarget.tenantId}
          tenantName={payTarget.name}
          monthlyPricePhp={payTarget.monthlyPricePhp}
          anchorDayKey={payTarget.anchorDayKey}
          paidThroughDayKey={payTarget.paidThroughDayKey}
          onClose={() => setPayTarget(null)}
          onRecorded={() => router.refresh()}
        />
      )}
    </div>
  )
}

function DayCell({
  day,
  isSelected,
  onSelect,
}: {
  day: CalendarDay
  isSelected: boolean
  onSelect: () => void
}) {
  const hidden = day.entries.length - CHIPS_PER_DAY
  const tone = isSelected
    ? 'border-white/40 bg-white/[0.07]'
    : day.isToday
      ? 'border-amber-300/40 bg-white/[0.03]'
      : 'border-white/[0.06] hover:border-white/20 hover:bg-white/[0.03]'

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`${formatDueDay(day.dayKey)}: ${day.entries.length} subscriber${day.entries.length === 1 ? '' : 's'}`}
      className={`flex min-h-16 flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-24 ${tone} ${
        day.isInMonth ? '' : 'opacity-40'
      }`}
    >
      <span
        className={`text-xs font-semibold tabular-nums ${day.isToday ? 'text-amber-300' : 'text-white/70'}`}
      >
        {day.dayOfMonth}
      </span>

      {/* Phones: dots and a count. Names do not fit a seventh of 390px. */}
      {day.entries.length > 0 && (
        <span className="mt-auto flex flex-wrap items-center gap-0.5 sm:hidden">
          {day.entries.slice(0, CHIPS_PER_DAY).map((entry) => (
            <span key={entry.key} className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[entry.kind]}`} />
          ))}
          {hidden > 0 && <span className="text-[10px] text-white/55">+{hidden}</span>}
        </span>
      )}

      <span className="mt-1 hidden min-w-0 flex-col gap-0.5 sm:flex">
        {day.entries.slice(0, CHIPS_PER_DAY).map((entry) => (
          <span
            key={entry.key}
            className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_FILL[entry.kind]} ${KIND_INK[entry.kind]} ${
              entry.isDormant && entry.kind !== 'paid' ? 'opacity-60' : ''
            }`}
          >
            {entry.name}
          </span>
        ))}
        {hidden > 0 && <span className="px-1.5 text-[11px] text-white/55">+{hidden} more</span>}
      </span>
    </button>
  )
}

function DayDetail({
  day,
  onMarkPaid,
}: {
  day: CalendarDay | null
  onMarkPaid: (entry: CalendarEntry) => void
}) {
  if (!day) {
    return <p className="mt-5 text-sm text-white/50">Pick a day to see who is due.</p>
  }

  const unpaid = day.entries.filter((entry) => entry.kind !== 'paid')
  const unpaidPhp = unpaid.reduce((sum, entry) => sum + entry.amountPhp, 0)

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{formatDueDay(day.dayKey)}</h3>
        {unpaid.length > 0 && (
          <span className="text-xs text-white/55">
            {unpaid.length} to collect · {peso(unpaidPhp)}
          </span>
        )}
      </div>
      {day.entries.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">Nobody is due this day.</p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {day.entries.map((entry) => (
            <CollectionsEntry key={entry.key} entry={entry} onMarkPaid={onMarkPaid} />
          ))}
        </ul>
      )}
    </div>
  )
}
