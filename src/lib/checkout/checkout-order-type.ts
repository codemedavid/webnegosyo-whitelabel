/**
 * The one `order_types` read `createOrderAction` makes.
 *
 * The action used to read the same row up to four times — minimum, advance
 * schedule, delivery kind, and the merchant email's name (that last one without
 * a tenant filter) — and a fifth time for the tenant-Supabase backend. One
 * tenant-scoped read now serves every consumer, including the service charge
 * the server recomputes instead of trusting the browser.
 */

import { getAdvanceOrderConfig, type AdvanceOrderConfig } from '@/lib/advance-order-utils'
import type { ServiceChargeRule } from '@/lib/order-service-charge'

export const CHECKOUT_ORDER_TYPE_SELECT = [
  'name',
  'type',
  'minimum_order_amount',
  'available_on_web',
  'service_charge_enabled',
  'service_charge_type',
  'service_charge_value',
  'advance_order_enabled',
  'advance_order_allow_asap',
  'advance_order_lead_time_minutes',
  'advance_order_max_days_ahead',
  'advance_order_slot_interval_minutes',
].join(', ')

export interface CheckoutOrderTypeRow extends ServiceChargeRule {
  name?: string | null
  type?: string | null
  minimum_order_amount?: number | string | null
  available_on_web?: boolean | null
  advance_order_enabled?: boolean | null
  advance_order_allow_asap?: boolean | null
  advance_order_lead_time_minutes?: number | null
  advance_order_max_days_ahead?: number | null
  advance_order_slot_interval_minutes?: number | null
}

/** The advance-order config this row describes (defaults when absent). */
export function advanceConfigOf(row: CheckoutOrderTypeRow | null): AdvanceOrderConfig {
  return getAdvanceOrderConfig(row as Parameters<typeof getAdvanceOrderConfig>[0])
}
