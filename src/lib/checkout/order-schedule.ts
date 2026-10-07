/**
 * Advance-order schedule validation (authoritative; covers EVERY order backend).
 *
 * The client sends `scheduledForISO` and may also stash `scheduled_for` /
 * `scheduled_for_label` in customer data. The requested time is re-validated
 * against the order type's advance config, and customer data is kept in
 * lockstep with what is actually persisted, so DB filtering and every display
 * agree (no "ASAP column but scheduled label" desync).
 *
 * Pure: never mutates the customer data it is given.
 */

import { findCartPresellDate } from '@/lib/presell/availability'
import { presellAdvanceConfig } from '@/lib/presell/checkout-schedule'
import { advanceConfigOf, type CheckoutOrderTypeRow } from '@/lib/checkout/checkout-order-type'

const SUBMIT_GRACE_MS = 5 * 60_000
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const MAX_LABEL_LENGTH = 80

export interface OrderScheduleInput {
  scheduledForISO: string | undefined
  orderTypeId: string | undefined
  orderTypeRow: CheckoutOrderTypeRow | null
  items: readonly { presell_date?: string }[]
  customerData: Record<string, unknown> | undefined
  now: Date
}

export interface OrderSchedule {
  /** The validated instant, or undefined for ASAP. */
  scheduledISO: string | undefined
  customerData: Record<string, unknown> | undefined
}

function validateScheduledISO(input: OrderScheduleInput): string | undefined {
  if (!input.scheduledForISO || !input.orderTypeId) return undefined
  const when = new Date(input.scheduledForISO)
  const whenMs = when.getTime()
  if (Number.isNaN(whenMs)) return undefined

  // A presell cart schedules against its allocated date, which may lie past
  // the order type's horizon (or the type may never schedule at all). The same
  // stretch the checkout hook applied is applied here.
  const baseCfg = advanceConfigOf(input.orderTypeRow)
  const cartPresellDate = findCartPresellDate(input.items)
  const cfg = cartPresellDate ? presellAdvanceConfig(baseCfg, cartPresellDate, input.now) : baseCfg
  const nowMs = input.now.getTime()
  const minMs = nowMs + cfg.leadTimeMinutes * MINUTE_MS - SUBMIT_GRACE_MS
  const maxMs = nowMs + (cfg.maxDaysAhead + 1) * DAY_MS // generous horizon
  if (cfg.enabled && whenMs >= minMs && whenMs <= maxMs) return when.toISOString()

  // Log the parsed/normalized timestamp, never the raw client string.
  console.warn('[Order] Rejected out-of-policy scheduled_for', {
    orderTypeId: input.orderTypeId,
    requestedAt: when.toISOString(),
  })
  return undefined
}

function reconcileCustomerData(
  customerData: Record<string, unknown> | undefined,
  scheduledISO: string | undefined,
): Record<string, unknown> | undefined {
  if (!customerData) return customerData
  if (!scheduledISO) {
    if (!('scheduled_for' in customerData) && !('scheduled_for_label' in customerData)) return customerData
    const { scheduled_for: _for, scheduled_for_label: _label, ...rest } = customerData
    void _for
    void _label
    return rest
  }
  const rawLabel = customerData.scheduled_for_label
  const cleanLabel = typeof rawLabel === 'string'
    ? rawLabel.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH)
    : undefined
  return {
    ...customerData,
    scheduled_for: scheduledISO,
    ...(cleanLabel ? { scheduled_for_label: cleanLabel } : {}),
  }
}

export function resolveOrderSchedule(input: OrderScheduleInput): OrderSchedule {
  const scheduledISO = validateScheduledISO(input)
  return { scheduledISO, customerData: reconcileCustomerData(input.customerData, scheduledISO) }
}
