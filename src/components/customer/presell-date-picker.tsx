'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PresellCalendar } from '@/lib/presell/availability'
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
 * hand-formatted labels, so server and client paint the same grid.
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

function firstAvailableDate(calendar: PresellCalendar, todayKey: string): string | null {
  const open = [...calendar.entries()]
    .filter(([date, left]) => date >= todayKey && left > 0)
    .map(([date]) => date)
    .sort()
  return open[0] ?? null
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
  const initialCursor = useMemo<MonthCursor>(
    () => monthCursorOf(selectedDate ?? firstAvailableDate(calendar, todayKey) ?? todayKey),
    // Only the opening month is derived; navigation owns it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [cursor, setCursor] = useState<MonthCursor>(initialCursor)
  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const hasAnyDate = firstAvailableDate(calendar, todayKey) !== null

  return (
    <div className="rounded-2xl border p-3" style={{ borderColor }}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-black/5 touch-manipulation"
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold" style={{ color: textColor }}>
          {formatMonthTitle(cursor)}
        </p>
        <button
          type="button"
          aria-label="Next month"
          className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-black/5 touch-manipulation"
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-[11px] font-medium uppercase" style={{ color: mutedTextColor }}>
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
          const isSelected = selectedDate === dateKey
          const dayNumber = Number(dateKey.slice(-2))
          const status = isSoldOut ? 'sold out' : isOpen ? `${left} left` : 'not available'

          return (
            <button
              key={dateKey}
              type="button"
              disabled={!isOpen}
              aria-pressed={isSelected}
              aria-label={`${formatPresellDayLabel(dateKey)}, ${status}`}
              onClick={() => onSelect(dateKey)}
              className="flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: isSelected ? accentColor : borderColor,
                backgroundColor: isSelected ? accentColor : undefined,
                color: isSelected ? '#ffffff' : textColor,
                textDecoration: isSoldOut ? 'line-through' : undefined,
              }}
            >
              <span>{dayNumber}</span>
              {isOpen && (
                <span
                  className="text-[10px] font-medium leading-none"
                  style={{ color: isSelected ? '#ffffff' : accentColor }}
                >
                  {left} left
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!hasAnyDate && (
        <p className="mt-3 text-center text-sm" style={{ color: mutedTextColor }}>
          No dates available for pre-order right now.
        </p>
      )}
    </div>
  )
}
