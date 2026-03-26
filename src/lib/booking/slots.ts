import { createAdminClient } from '@/lib/supabase/admin'
import type { TimeSlot } from './types'

const PHT_OFFSET = 8 // UTC+8
const START_HOUR = 9
const END_HOUR = 16
const END_MINUTE = 30
const SLOT_INTERVAL = 30

export function isWeekday(date: Date): boolean {
  const day = date.getUTCDay()
  return day >= 1 && day <= 5
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

function formatLabel(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
}

function getNowInPHT(): { hours: number; minutes: number; dateStr: string } {
  const now = new Date()
  const phtTime = new Date(now.getTime() + PHT_OFFSET * 60 * 60 * 1000)
  return {
    hours: phtTime.getUTCHours(),
    minutes: phtTime.getUTCMinutes(),
    dateStr: phtTime.toISOString().split('T')[0],
  }
}

export function generateTimeSlots(date: Date): TimeSlot[] {
  if (!isWeekday(date)) return []

  const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  const phtNow = getNowInPHT()
  const isToday = dateStr === phtNow.dateStr

  const slots: TimeSlot[] = []
  let hour = START_HOUR
  let minute = 0

  while (hour < END_HOUR || (hour === END_HOUR && minute <= END_MINUTE)) {
    const time = formatTime(hour, minute)
    const label = formatLabel(hour, minute)

    if (!isToday || hour > phtNow.hours || (hour === phtNow.hours && minute > phtNow.minutes)) {
      slots.push({ time, label, available: true })
    }

    minute += SLOT_INTERVAL
    if (minute >= 60) {
      hour += 1
      minute = 0
    }
  }

  return slots
}

export async function getBookedSlots(date: Date): Promise<string[]> {
  const supabase = createAdminClient()
  const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('leads')
    .select('booking_time')
    .eq('booking_date', dateStr)
    .neq('status', 'lost')

  if (error) {
    console.error('[Booking] Failed to fetch booked slots:', error)
    return []
  }

  return (data || []).map(row => {
    const t = String(row.booking_time)
    return t.length > 5 ? t.slice(0, 5) : t
  })
}

export async function getAvailableSlots(date: Date): Promise<TimeSlot[]> {
  const allSlots = generateTimeSlots(date)
  const booked = await getBookedSlots(date)
  const bookedSet = new Set(booked)

  return allSlots.map(slot => ({
    ...slot,
    available: !bookedSet.has(slot.time),
  }))
}
