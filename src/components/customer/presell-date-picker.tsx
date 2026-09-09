'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarSearch } from 'lucide-react'
import type { PresellCalendar } from '@/lib/presell/availability'
import { PRESELL_HINT_THRESHOLD } from '@/lib/presell/availability'
import { setAlpha, getContrastColor } from '@/lib/branding-utils'
import {
  buildMonthGrid,
  formatMonthTitle,
  formatPresellDayLabel,
  monthCursorOf,
  shiftMonth,
  WEEKDAY_LABELS,
  type MonthCursor,
} from '@/lib/presell/month-grid'

/**
 * The calendar a customer picks a presell date from.
 *
 * Every allocated date wears its remaining count; sold-out, unallocated and
 * past dates cannot be chosen. It renders from plain YYYY-MM-DD keys and
 * hand-formatted labels, so server and client paint the same grid. Colour
 * comes from the tenant's accent alone, so any merchant palette sits on it.
 */

interface PresellDatePickerProps {
  calendar: PresellCalendar
  /** Today's business-day key (Asia/Manila); dates before it are closed. */
  todayKey: string
  selectedDate: string | null
  onSelect: (dateKey: string) => void
  accentColor?: string
  textColor?: string
  mutedTextColor?: string
  borderColor?: string
}

function openDates(calendar: PresellCalendar, todayKey: string): string[] {
  return [...calendar.entries()]
    .filter(([date, left]) => date >= todayKey && left > 0)
    .map(([date]) => date)
    .sort()
}

function isSameMonth(a: MonthCursor, b: MonthCursor): boolean {
  return a.year === b.year && a.month === b.month
}

export function PresellDatePicker({
  calendar,
  todayKey,
  selectedDate,
  onSelect,
  accentColor = '#111827',
  textColor = '#111827',
  mutedTextColor = '#6b7280',
  borderColor = '#e5e7eb',
}: PresellDatePickerProps) {
  const available = useMemo(() => openDates(calendar, todayKey), [calendar, todayKey])
  const initialCursor = useMemo<MonthCursor>(
    () => monthCursorOf(selectedDate ?? available[0] ?? todayKey),
    // Only the opening month is derived; navigation owns it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [cursor, setCursor] = useState<MonthCursor>(initialCursor)
  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const currentMonth = monthCursorOf(todayKey)
  const isAtCurrentMonth = isSameMonth(cursor, currentMonth)
  const hasOpenInView = available.some((date) => isSameMonth(monthCursorOf(date), cursor))
  const monthStartKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-01`
  const nextOpenElsewhere = available.find((date) => date > monthStartKey && !isSameMonth(monthCursorOf(date), cursor)) ?? available[0] ?? null
  const accentText = getContrastColor(accentColor)

  const navButton = 'inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/5 touch-manipulation disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <div className="rounded-2xl border p-3" style={{ borderColor, backgroundColor: setAlpha(accentColor, 0.02) }}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={isAtCurrentMonth}
          className={navButton}
          style={{ color: textColor }}
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold tabular-nums" style={{ color: textColor }}>
          {formatMonthTitle(cursor)}
        </p>
        <button
          type="button"
          aria-label="Next month"
          className={navButton}
          style={{ color: textColor }}
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: mutedTextColor }}>
            {label}
          </span>
        ))}
        {weeks.flat().map((dateKey, index) => {
          if (!dateKey) return <span key={`blank-${index}`} aria-hidden="true" />

          const left = calendar.get(dateKey)
          const isPast = dateKey < todayKey
          const isAllocated = left !== undefined && !isPast
          const isSoldOut = isAllocated && left <= 0
          const isOpen = isAllocated && left > 0
          const isLow = isOpen && left <= PRESELL_HINT_THRESHOLD
          const isSelected = selectedDate === dateKey
          const isToday = dateKey === todayKey
          const dayNumber = Number(dateKey.slice(-2))
          const status = isSoldOut ? 'sold out' : isOpen ? `${left} left` : 'not available'

          const cellStyle: React.CSSProperties = isSelected
            ? { backgroundColor: accentColor, borderColor: accentColor, color: accentText, boxShadow: `0 6px 16px -6px ${setAlpha(accentColor, 0.55)}` }
            : isOpen
              ? { backgroundColor: setAlpha(accentColor, isLow ? 0.14 : 0.07), borderColor: setAlpha(accentColor, isLow ? 0.55 : 0.3), color: textColor }
              : isSoldOut
                ? { backgroundColor: setAlpha(mutedTextColor, 0.08), borderColor: 'transparent', color: mutedTextColor, textDecoration: 'line-through' }
                : { borderColor: 'transparent', color: mutedTextColor }

          return (
            <button
              key={dateKey}
              type="button"
              disabled={!isOpen}
              aria-pressed={isSelected}
              aria-label={`${formatPresellDayLabel(dateKey)}, ${status}`}
              onClick={() => onSelect(dateKey)}
              className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-sm font-semibold tabular-nums transition-[background-color,box-shadow,transform] duration-150 touch-manipulation active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{ ...cellStyle, ['--tw-ring-color' as string]: accentColor, opacity: !isOpen && !isSoldOut ? 0.45 : 1 }}
            >
              <span className={isToday && !isSelected ? 'underline decoration-2 underline-offset-2' : undefined}>{dayNumber}</span>
              {isOpen && (
                <span
                  className="max-w-full whitespace-nowrap rounded-full px-1 text-[9px] font-bold leading-4 tracking-tight sm:px-1.5 sm:text-[10px]"
                  style={isSelected
                    ? { backgroundColor: setAlpha(accentText, 0.2), color: accentText }
                    : { backgroundColor: setAlpha(accentColor, isLow ? 0.9 : 0.12), color: isLow ? accentText : accentColor }}
                >
                  {left} left
                </span>
              )}
            </button>
          )
        })}
      </div>

      {available.length > 0 && !hasOpenInView && nextOpenElsewhere && (
        <button
          type="button"
          onClick={() => setCursor(monthCursorOf(nextOpenElsewhere))}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm font-semibold transition-colors hover:bg-black/5"
          style={{ borderColor: setAlpha(accentColor, 0.4), color: accentColor }}
        >
          <CalendarSearch className="h-4 w-4" />
          Next available: {formatPresellDayLabel(nextOpenElsewhere)}
        </button>
      )}

      {available.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium" style={{ color: mutedTextColor }}>
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border" style={{ backgroundColor: setAlpha(accentColor, 0.12), borderColor: setAlpha(accentColor, 0.4) }} />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: accentColor }} />
            Few left
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: setAlpha(mutedTextColor, 0.25) }} />
            Sold out
          </span>
        </div>
      ) : (
        <p className="mt-3 text-center text-sm" style={{ color: mutedTextColor }}>
          No dates available for pre-order right now.
        </p>
      )}
    </div>
  )
}
