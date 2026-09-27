'use client'

/**
 * Advance-order scheduling for checkout ("ASAP" vs a chosen date and time).
 *
 * Moved out of useCheckout. The schedule dates were regenerated — every
 * horizon day, each with its full slot list — on EVERY render, and checkout
 * re-renders on every keystroke in the customer form. They are now memoized on
 * the inputs that actually move them: the order type's config, the minute
 * clock and the operating hours.
 *
 * A presell cart is committed to one pickup date: scheduling is forced on,
 * ASAP is off, and the horizon stretches to reach that date. See
 * src/lib/presell/checkout-schedule.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  combineDateAndTime,
  formatScheduledFor,
  generateScheduleDates,
  generateTimeSlots,
  getAdvanceOrderConfig,
  getFirstAvailableSlot,
  isValidScheduledTime,
} from '@/lib/advance-order-utils'
import { findCartPresellDate } from '@/lib/presell/availability'
import { presellAdvanceConfig, presellScheduleDates } from '@/lib/presell/checkout-schedule'
import { normalizeOperatingHours } from '@/lib/operating-hours'
import type { CartItem, OrderType, Tenant } from '@/types/database'

/** How often the slot cutoff re-evaluates. */
const CLOCK_TICK_MS = 60_000

export type ScheduleMode = 'asap' | 'scheduled'

export interface UseCheckoutScheduleInput {
  selectedOrderType: OrderType | undefined
  items: readonly CartItem[]
  operatingHours: Tenant['operating_hours'] | null | undefined
}

/** `now` drives slot availability; refreshed each minute so the cutoff stays accurate. */
function useMinuteClock(): Date {
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])
  return now
}

export function useCheckoutSchedule({ selectedOrderType, items, operatingHours: rawHours }: UseCheckoutScheduleInput) {
  const now = useMinuteClock()
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('asap')
  const [scheduleDate, setScheduleDate] = useState<string>('') // YYYY-MM-DD (local)
  const [scheduleTime, setScheduleTime] = useState<string>('') // HH:MM (24h, local)

  const cartPresellDate = useMemo(() => findCartPresellDate(items), [items])
  const operatingHours = useMemo(() => normalizeOperatingHours(rawHours ?? null), [rawHours])

  const advanceConfig = useMemo(() => {
    const base = getAdvanceOrderConfig(selectedOrderType)
    return cartPresellDate ? presellAdvanceConfig(base, cartPresellDate, now) : base
  }, [selectedOrderType, cartPresellDate, now])

  // Only surface dates that still have at least one selectable slot (a
  // too-late "today" or a day fully inside the lead window is dropped).
  const scheduleDates = useMemo(() => {
    const generated = advanceConfig.enabled
      ? generateScheduleDates(advanceConfig, now, operatingHours).filter(
          (d) => generateTimeSlots(advanceConfig, d.value, now, operatingHours).length > 0
        )
      : []
    return cartPresellDate ? presellScheduleDates(generated, cartPresellDate) : generated
  }, [advanceConfig, now, operatingHours, cartPresellDate])

  const timeSlots = useMemo(
    () => (advanceConfig.enabled && scheduleDate ? generateTimeSlots(advanceConfig, scheduleDate, now, operatingHours) : []),
    [advanceConfig, scheduleDate, now, operatingHours]
  )

  const isScheduling = advanceConfig.enabled && scheduleMode === 'scheduled'
  const scheduledDateObj = useMemo(
    () => (isScheduling && scheduleDate && scheduleTime ? combineDateAndTime(scheduleDate, scheduleTime) : null),
    [isScheduling, scheduleDate, scheduleTime]
  )
  const scheduledForISO = scheduledDateObj ? scheduledDateObj.toISOString() : null
  const scheduledForLabel = scheduledDateObj ? formatScheduledFor(scheduledDateObj) : null
  const isScheduleValid = scheduledDateObj
    ? isValidScheduledTime(advanceConfig, scheduledDateObj, now, operatingHours)
    : true

  // Default the "When?" choice whenever the order type changes. Schedule-only
  // types (ASAP disabled) start in scheduled mode; others default to ASAP.
  const orderTypeId = selectedOrderType?.id
  useEffect(() => {
    if (!advanceConfig.enabled) {
      setScheduleMode('asap')
      return
    }
    setScheduleMode(advanceConfig.allowAsap ? 'asap' : 'scheduled')
  }, [orderTypeId, advanceConfig.enabled, advanceConfig.allowAsap])

  // Seed a sensible default slot on entering scheduled mode, and keep the
  // selection valid as time passes or the order type changes. Re-seeds when the
  // chosen date is missing, has gone stale (e.g. crossed midnight), or falls
  // outside the (possibly shrunk) horizon; otherwise snaps the time to a valid
  // slot for that date.
  useEffect(() => {
    if (!advanceConfig.enabled || scheduleMode !== 'scheduled') return
    // A presell cart's date is not a suggestion: pin it, then only snap the time.
    if (cartPresellDate) {
      const presellSlots = generateTimeSlots(advanceConfig, cartPresellDate, now, operatingHours)
      if (scheduleDate !== cartPresellDate) {
        setScheduleDate(cartPresellDate)
        setScheduleTime(presellSlots[0]?.value ?? '')
        return
      }
      if (presellSlots.length > 0 && (!scheduleTime || !presellSlots.some((s) => s.value === scheduleTime))) {
        setScheduleTime(presellSlots[0].value)
      }
      return
    }
    const dates = generateScheduleDates(advanceConfig, now, operatingHours)
    const isDateValid = !!scheduleDate && dates.some((d) => d.value === scheduleDate)
    const slots = isDateValid ? generateTimeSlots(advanceConfig, scheduleDate, now, operatingHours) : []
    if (!isDateValid || slots.length === 0) {
      const first = getFirstAvailableSlot(advanceConfig, now, operatingHours)
      setScheduleDate(first?.dateValue ?? '')
      setScheduleTime(first?.timeValue ?? '')
      return
    }
    if (!scheduleTime || !slots.some((s) => s.value === scheduleTime)) {
      setScheduleTime(slots[0].value)
    }
    // scheduleTime is read, not reacted to: a customer's own time pick must not
    // re-run the seeding, only the inputs that can invalidate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleMode, scheduleDate, advanceConfig, operatingHours, now, cartPresellDate])

  /** Change the scheduled date and snap the time to that date's first slot. */
  const handleScheduleDateChange = (date: string) => {
    setScheduleDate(date)
    setScheduleTime(generateTimeSlots(advanceConfig, date, now, operatingHours)[0]?.value ?? '')
  }

  return {
    now,
    advanceConfig,
    cartPresellDate,
    operatingHours,
    scheduleMode,
    setScheduleMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    scheduleDates,
    timeSlots,
    isScheduling,
    scheduledDateObj,
    scheduledForISO,
    scheduledForLabel,
    isScheduleValid,
    handleScheduleDateChange,
  }
}
