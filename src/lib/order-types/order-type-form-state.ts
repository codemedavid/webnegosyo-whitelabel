/**
 * The admin order-type form, as plain data.
 *
 * The configure screen used to hold every setting in one `useState` seeded from
 * props and then never resynced, so a save that landed on the server left the
 * form showing whatever was on screen before it — and a field added in the
 * dialog never appeared in the list until a hard reload. Pulling the shape out
 * here gives the component two things it lacked: a *signature* it can compare
 * against the incoming server row to know when to resync, and a `dirty` answer
 * it can use to show (or withhold) a save bar.
 *
 * Every number the merchant can type is clamped on the way out, so a blank or
 * out-of-range box reaches the server as a legal value rather than a Zod error
 * the merchant cannot read.
 */

import type { OrderType } from '@/types/database'
import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'
import { getAdvanceOrderConfig } from '@/lib/advance-order-utils'
import { isMessengerEnabledForOrderType } from '@/lib/messenger-availability'
import { MARKUP_PERCENT_MAX, MARKUP_PERCENT_MIN } from '@/lib/order-types/order-type-pricing'

export type ServiceChargeType = 'percentage' | 'fixed'

export interface OrderTypeFormState {
  name: string
  description: string
  note: string
  is_enabled: boolean
  available_on_web: boolean
  available_on_pos: boolean
  /** Text, not a number: blank has to survive round-tripping as "store price" (null). */
  pos_markup_percent: string
  messenger_enabled: boolean
  after_billing_payment_enabled: boolean
  service_charge_enabled: boolean
  service_charge_type: ServiceChargeType
  service_charge_value: number
  minimum_order_amount: number
  advance_order_enabled: boolean
  advance_order_allow_asap: boolean
  advance_order_lead_time_minutes: number
  advance_order_max_days_ahead: number
  advance_order_slot_interval_minutes: number
}

/** Ranges mirror `orderTypeSchema`, so a clamped value always validates. */
const LEAD_TIME_MAX_MINUTES = 10080
const MAX_DAYS_AHEAD_MAX = 60
const SLOT_INTERVAL_MIN_MINUTES = 5
const SLOT_INTERVAL_MAX_MINUTES = 240
const DEFAULT_SLOT_INTERVAL_MINUTES = 30

function clampInteger(value: number, min: number, max: number, fallback = 0): number {
  const rounded = Math.round(Number(value))
  if (!Number.isFinite(rounded)) return fallback
  return Math.min(max, Math.max(min, rounded))
}

/** Blank → null (store price). Anything unparseable is treated as blank; the range is clamped. */
export function parseMarkupPercent(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return Math.min(MARKUP_PERCENT_MAX, Math.max(MARKUP_PERCENT_MIN, value))
}

/** The form as the server currently has it. Columns added later arrive undefined. */
export function buildOrderTypeFormState(orderType: OrderType): OrderTypeFormState {
  const advance = getAdvanceOrderConfig(orderType)

  return {
    name: orderType.name,
    description: orderType.description || '',
    note: orderType.note || '',
    is_enabled: orderType.is_enabled,
    // Rows saved before the availability columns existed arrive undefined and mean "on".
    available_on_web: orderType.available_on_web !== false,
    available_on_pos: orderType.available_on_pos !== false,
    pos_markup_percent:
      orderType.pos_markup_percent === null || orderType.pos_markup_percent === undefined
        ? ''
        : String(orderType.pos_markup_percent),
    messenger_enabled: isMessengerEnabledForOrderType(orderType),
    // Opt-in: rows saved before the column existed arrive undefined and stay off.
    after_billing_payment_enabled: orderType.after_billing_payment_enabled ?? false,
    service_charge_enabled: orderType.service_charge_enabled ?? false,
    service_charge_type: orderType.service_charge_type ?? 'percentage',
    service_charge_value: orderType.service_charge_value ?? 0,
    // 0 (the column default) means "no minimum".
    minimum_order_amount: orderType.minimum_order_amount ?? 0,
    advance_order_enabled: advance.enabled,
    advance_order_allow_asap: advance.allowAsap,
    advance_order_lead_time_minutes: advance.leadTimeMinutes,
    advance_order_max_days_ahead: advance.maxDaysAhead,
    advance_order_slot_interval_minutes: advance.slotIntervalMinutes,
  }
}

/**
 * A stable string for one form state.
 *
 * The component compares the *signature* of the incoming server row, never the
 * prop object: an RSC re-render hands back a new object every time, and
 * resetting on identity would wipe what the merchant is typing.
 */
export function orderTypeFormSignature(state: OrderTypeFormState): string {
  return JSON.stringify(state)
}

export function isOrderTypeFormDirty(
  current: OrderTypeFormState,
  saved: OrderTypeFormState
): boolean {
  return orderTypeFormSignature(current) !== orderTypeFormSignature(saved)
}

/** The write payload, with every merchant-typed number clamped into range. */
export function toOrderTypeUpdateInput(
  state: OrderTypeFormState,
  { type, order_index }: Pick<OrderType, 'order_index'> & { type: OrderTypeKind }
) {
  return {
    type,
    order_index,
    name: state.name,
    description: state.description || undefined,
    note: state.note || undefined,
    is_enabled: state.is_enabled,
    available_on_web: state.available_on_web,
    available_on_pos: state.available_on_pos,
    pos_markup_percent: parseMarkupPercent(state.pos_markup_percent),
    messenger_enabled: state.messenger_enabled,
    after_billing_payment_enabled: state.after_billing_payment_enabled,
    service_charge_enabled: state.service_charge_enabled,
    service_charge_type: state.service_charge_type,
    service_charge_value: Math.max(0, Number(state.service_charge_value) || 0),
    minimum_order_amount: Math.max(0, Number(state.minimum_order_amount) || 0),
    advance_order_enabled: state.advance_order_enabled,
    advance_order_allow_asap: state.advance_order_allow_asap,
    advance_order_lead_time_minutes: clampInteger(
      state.advance_order_lead_time_minutes,
      0,
      LEAD_TIME_MAX_MINUTES
    ),
    advance_order_max_days_ahead: clampInteger(
      state.advance_order_max_days_ahead,
      0,
      MAX_DAYS_AHEAD_MAX
    ),
    advance_order_slot_interval_minutes: clampInteger(
      state.advance_order_slot_interval_minutes,
      SLOT_INTERVAL_MIN_MINUTES,
      SLOT_INTERVAL_MAX_MINUTES,
      DEFAULT_SLOT_INTERVAL_MINUTES
    ),
  }
}
