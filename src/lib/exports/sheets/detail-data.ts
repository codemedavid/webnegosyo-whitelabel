/** The rows the detail sheets are built from, as the platform stores them. */

import type { CutoffSchedule } from '@/lib/business-day/trading-day'
import type { PlatformOrderItemRow, PlatformOrderRow, PlatformPaymentRow } from '@/lib/reports/read/platform-order-row'
import { REPORT_ITEM_COLUMNS, REPORT_ORDER_COLUMNS, REPORT_PAYMENT_COLUMNS } from '@/lib/reports/read/platform-order-row'

export interface DetailOrderRow extends PlatformOrderRow {
  daily_number: number | null
  customer_id: string | null
  customer_name: string | null
  customer_contact: string | null
  item_count: number | null
  cancel_reason: string | null
}

export interface DetailItemRow extends PlatformOrderItemRow {
  price: number | string
  variation: string | null
  addons: string[] | null
  addon_details: unknown
  variation_selections: unknown
  special_instructions: string | null
  bundle_name: string | null
}

export interface DetailPaymentRow extends PlatformPaymentRow {
  id: string
  reference: string | null
  recorded_by: string | null
  note: string | null
}

export interface DetailShiftRow {
  id: string
  staff_user_id: string | null
  staff_name: string
  drawer_name: string | null
  outlet_id: string | null
  opened_at: string
  closed_at: string | null
}

export interface DetailCustomerRow {
  id: string
  name: string | null
  phone_e164: string | null
  order_count: number | null
  first_order_at: string | null
}

export const DETAIL_ORDER_COLUMNS = `${REPORT_ORDER_COLUMNS}, daily_number, customer_id, customer_name, customer_contact, item_count, cancel_reason`
export const DETAIL_ITEM_COLUMNS = `${REPORT_ITEM_COLUMNS}, price, variation, addons, addon_details, variation_selections, special_instructions, bundle_name`
export const DETAIL_PAYMENT_COLUMNS = `${REPORT_PAYMENT_COLUMNS}, id, reference, recorded_by, note`
export const DETAIL_SHIFT_COLUMNS = 'id, staff_user_id, staff_name, drawer_name, outlet_id, opened_at, closed_at'
export const DETAIL_CUSTOMER_COLUMNS = 'id, name, phone_e164, order_count, first_order_at'

export interface DetailData {
  /** Oldest first. */
  orders: readonly DetailOrderRow[]
  itemsByOrder: ReadonlyMap<string, readonly DetailItemRow[]>
  paymentsByOrder: ReadonlyMap<string, readonly DetailPaymentRow[]>
  /** Shifts the caller may read that overlap the period; empty when they may read none. */
  shifts: readonly DetailShiftRow[]
  customers: ReadonlyMap<string, DetailCustomerRow>
  outletNames: ReadonlyMap<string, string>
  schedule: CutoffSchedule
  /** The period, half-open epoch ms: a customer whose first order ever falls inside is a first-timer. */
  start: number
  end: number
}
