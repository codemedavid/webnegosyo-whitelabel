/**
 * When the store is busy: completed orders by hour of day or day of week,
 * in Manila time. Pure.
 *
 * Weekdays are AVERAGED per occurrence: a 30-day window holds five of some
 * weekdays and four of others, and raw totals would crown whichever happened
 * to occur five times.
 */

import { DAY_MS, manilaDayStart, manilaHour } from '@/lib/dashboard/periods'
import { isCompletedSale, type SaleRecord } from '@/lib/dashboard/sale-record'

export type TimeGrouping = 'hour' | 'weekday'

export interface TimeSlot {
  label: string
  orders: number
  sales: number
}

export interface TimeProfile {
  by: TimeGrouping
  slots: TimeSlot[]
  best: TimeSlot | null
  /** The quietest slot that still had orders (a closed hour is not "slow"). */
  quietest: TimeSlot | null
  completedOrders: number
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${suffix}`
}

function manilaWeekday(ms: number): number {
  return new Date(ms + MANILA_OFFSET_MS).getUTCDay()
}

/** How many times each weekday occurs in [startMs, endMs). */
function weekdayOccurrences(startMs: number, endMs: number): number[] {
  const counts = Array.from({ length: 7 }, () => 0)
  for (let day = manilaDayStart(startMs); day < endMs; day += DAY_MS) counts[manilaWeekday(day)] += 1
  return counts
}

export function buildTimeProfile(
  sales: readonly SaleRecord[],
  { by, startMs, endMs }: { by: TimeGrouping; startMs: number; endMs: number },
): TimeProfile {
  const completed = sales.filter((sale) => sale.at >= startMs && sale.at < endMs && isCompletedSale(sale))
  const size = by === 'hour' ? 24 : 7
  const totals = Array.from({ length: size }, () => ({ orders: 0, sales: 0 }))
  for (const sale of completed) {
    const index = by === 'hour' ? manilaHour(sale.at) : manilaWeekday(sale.at)
    totals[index] = { orders: totals[index].orders + 1, sales: totals[index].sales + sale.total }
  }

  const occurrences = by === 'weekday' ? weekdayOccurrences(startMs, endMs) : null
  const slots = totals.map((total, index) => {
    const divisor = occurrences ? Math.max(1, occurrences[index]) : 1
    return {
      label: by === 'hour' ? hourLabel(index) : WEEKDAYS[index],
      orders: round2(total.orders / divisor),
      sales: round2(total.sales / divisor),
    }
  })

  const active = slots.filter((slot) => slot.orders > 0)
  const best = active.reduce<TimeSlot | null>((top, slot) => (!top || slot.orders > top.orders ? slot : top), null)
  const quietest = active.reduce<TimeSlot | null>((low, slot) => (!low || slot.orders < low.orders ? slot : low), null)
  return { by, slots, best, quietest: active.length > 1 ? quietest : null, completedOrders: completed.length }
}
