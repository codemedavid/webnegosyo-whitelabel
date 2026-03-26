'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { BookingStepOneData } from '@/lib/booking/validation'
import type { TimeSlot, BookingFormData } from '@/lib/booking/types'

interface StepTwoProps {
  stepOneData: BookingStepOneData
  onBack: () => void
  onSubmit: (data: BookingFormData) => void
  isSubmitting: boolean
}

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  // getDay() returns 0=Sun, need to shift so Monday=0
  const day = new Date(year, month, 1).getDay()
  return (day + 6) % 7 // Monday-based: Mon=0 ... Sun=6
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isWeekendDay(year: number, month: number, day: number): boolean {
  const d = new Date(year, month, day).getDay()
  return d === 0 || d === 6
}

function isPastDay(year: number, month: number, day: number): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(year, month, day)
  return target < today
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function StepTwo({ stepOneData, onBack, onSubmit, isSubmitting }: StepTwoProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedDate) return
    const dateStr = toDateString(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate()
    )
    setLoading(true)
    setSelectedTime(null)
    setSlots([])

    fetch(`/api/booking/slots?date=${dateStr}`)
      .then(res => res.json())
      .then(json => {
        setSlots(Array.isArray(json.slots) ? json.slots : [])
      })
      .catch(() => setSlots([]))
      .finally(() => setLoading(false))
  }, [selectedDate])

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  function handleDayClick(day: number) {
    if (isWeekendDay(viewYear, viewMonth, day)) return
    if (isPastDay(viewYear, viewMonth, day)) return
    setSelectedDate(new Date(viewYear, viewMonth, day))
  }

  function handleConfirm() {
    if (!selectedDate || !selectedTime) return
    const dateStr = toDateString(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate()
    )
    onSubmit({
      name: stepOneData.name,
      email: stepOneData.email,
      phone: stepOneData.phone,
      bookingDate: dateStr,
      bookingTime: selectedTime,
    })
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  // Build grid cells: leading empty cells + day cells
  const totalCells = firstDay + daysInMonth
  const rows = Math.ceil(totalCells / 7)

  const selectedDateStr = selectedDate
    ? toDateString(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
    : null

  return (
    <div className="bg-zinc-900 p-6 rounded-2xl">
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-zinc-400 text-sm">Step 2 of 2</p>
        <div className="flex gap-1.5 items-center">
          <span className="w-2 h-2 rounded-full bg-zinc-700 inline-block" />
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
        </div>
      </div>

      <h2 className="text-zinc-100 text-xl font-semibold mb-1">Choose a Time</h2>
      <p className="text-zinc-400 text-sm mb-6">Pick a weekday that works for you</p>

      {/* Mini Calendar */}
      <div className="mb-5">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={prevMonth}
            className="text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors text-lg leading-none"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-zinc-100 text-sm font-medium">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors text-lg leading-none"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((h, i) => (
            <div key={i} className="text-center text-xs text-zinc-500 py-1 font-medium">
              {h}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: rows * 7 }).map((_, idx) => {
            const day = idx - firstDay + 1
            if (day < 1 || day > daysInMonth) {
              return <div key={idx} />
            }

            const disabled = isWeekendDay(viewYear, viewMonth, day) || isPastDay(viewYear, viewMonth, day)
            const dateStr = toDateString(viewYear, viewMonth, day)
            const isSelected = selectedDateStr === dateStr

            return (
              <button
                key={idx}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(day)}
                className={[
                  'text-center text-sm py-1.5 rounded-md transition-colors mx-0.5',
                  disabled
                    ? 'opacity-30 pointer-events-none text-zinc-400'
                    : isSelected
                    ? 'bg-amber-500 text-zinc-900 font-bold'
                    : 'text-zinc-100 hover:bg-zinc-800',
                ].join(' ')}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time chips */}
      {selectedDate && (
        <div className="mb-5">
          <p className="text-zinc-400 text-xs mb-2 uppercase tracking-wide">Available times</p>
          {loading ? (
            <p className="text-zinc-500 text-sm">Loading slots…</p>
          ) : slots.length === 0 ? (
            <p className="text-zinc-500 text-sm">No slots available for this date.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map(slot => {
                const isSelected = selectedTime === slot.time
                const isBooked = !slot.available

                return (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={isBooked}
                    onClick={() => !isBooked && setSelectedTime(slot.time)}
                    className={[
                      'rounded-md px-3 py-1.5 text-sm border transition-colors',
                      isBooked
                        ? 'line-through text-zinc-600 pointer-events-none opacity-40 border-zinc-800 bg-zinc-950'
                        : isSelected
                        ? 'bg-amber-500/20 border-amber-500 text-amber-500 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-100 hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          ← Back
        </Button>
        <Button
          type="button"
          disabled={!selectedDate || !selectedTime || isSubmitting}
          onClick={handleConfirm}
          className="flex-1 bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 disabled:opacity-40 focus-visible:ring-amber-500/30"
        >
          {isSubmitting ? 'Booking…' : 'Confirm Booking'}
        </Button>
      </div>
    </div>
  )
}
