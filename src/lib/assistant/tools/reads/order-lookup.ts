/**
 * get_order — one order by its daily number ("order #42", "#7 kahapon"): what
 * was ordered, the money, and who did what to it (its Store Activity rows).
 *
 * Platform stores only (`flags.isPlatformOrders`): the read is the platform
 * `orders` table through the CALLER's session, so the orders SELECT policy
 * (order-read keys, branch scope) decides what comes back. The history is the
 * activity RPC, which shows a caller without `activity_view` only their own
 * rows. Daily numbers reset every day, so without a date the last 7 days are
 * searched and the newest match wins (the others are named).
 */

import 'server-only'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/staff-permissions'
import { fetchStoreActivity, type ActivityRpcClient } from '@/lib/activity/repository'
import type { StoreActivityEvent } from '@/lib/activity/store-event'
import { manilaDayKey } from '@/lib/activity/format'
import { shiftDayKey } from '@/lib/assistant/insights/when'
import {
  buildOrderLookupResult,
  ORDER_ITEM_LIMIT,
  type LookedUpItem,
  type LookedUpOrder,
} from '@/lib/assistant/insights/order-lookup'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const SEARCH_DAYS = 7
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

const input = z.object({
  number: z.string().trim().min(1).max(8).describe('Daily order number, e.g. 42'),
  date: z.string().regex(DAY_KEY).optional().describe('Day it was placed, YYYY-MM-DD; default = latest in 7 days'),
})
type Input = z.infer<typeof input>

const ORDER_SELECT =
  'id, daily_number, order_date, created_at, status, payment_status, payment_method_name, order_type, source, total, discount_total, delivery_fee, service_charge_amount, amount_paid, cancel_reason, customer_name, revision_number, scheduled_for'

interface OrderRow {
  id: string
  daily_number: number | null
  order_date: string | null
  created_at: string
  status: string | null
  payment_status: string | null
  payment_method_name: string | null
  order_type: string | null
  source: string | null
  total: number | string | null
  discount_total: number | string | null
  delivery_fee: number | string | null
  service_charge_amount: number | string | null
  amount_paid: number | string | null
  cancel_reason: string | null
  customer_name: string | null
  revision_number: number | null
  scheduled_for: string | null
}

interface ItemRow {
  menu_item_name: string | null
  quantity: number | string | null
  subtotal: number | string | null
  variation: string | null
  addons: string[] | null
}

/** The slice of the session client this tool uses (generated types stay out of src/lib). */
interface OrdersDb {
  from(table: 'orders' | 'order_items'): {
    select(columns: string): OrdersQuery
  }
}
interface OrdersQuery extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  eq(column: string, value: string | number): OrdersQuery
  gte(column: string, value: string): OrdersQuery
  lte(column: string, value: string): OrdersQuery
  order(column: string, options: { ascending: boolean }): OrdersQuery
  limit(count: number): OrdersQuery
}

function num(value: number | string | null): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

function toOrder(row: OrderRow): LookedUpOrder {
  return {
    id: row.id,
    dailyNumber: row.daily_number ?? 0,
    orderDate: row.order_date,
    createdAt: row.created_at,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method_name,
    orderType: row.order_type,
    source: row.source,
    total: num(row.total),
    discountTotal: num(row.discount_total),
    deliveryFee: num(row.delivery_fee),
    serviceCharge: num(row.service_charge_amount),
    amountPaid: row.amount_paid === null ? null : num(row.amount_paid),
    cancelReason: row.cancel_reason,
    customerName: row.customer_name,
    revision: row.revision_number,
    scheduledFor: row.scheduled_for,
  }
}

function toItem(row: ItemRow): LookedUpItem {
  return {
    name: row.menu_item_name?.trim() || 'Item',
    quantity: num(row.quantity),
    subtotal: num(row.subtotal),
    variation: row.variation?.trim() || null,
    addons: (row.addons ?? []).filter((addon) => typeof addon === 'string' && addon.trim() !== ''),
  }
}

export const getOrderTool: AssistantToolDef<Input> = {
  name: 'get_order',
  description: 'One order by its number (#42): items, total, payment, status, and who rang it up/confirmed/edited/cancelled it.',
  access: { permission: 'orders' },
  isAvailable: (flags) => flags.isPlatformOrders === true,
  input,
  async run(ctx, { number, date }) {
    const digits = number.replace(/^#/, '')
    if (!/^\d{1,6}$/.test(digits) || Number(digits) < 1) {
      return { facts: { available: false, reason: 'Give the order number as digits, e.g. 42.' } }
    }
    const today = manilaDayKey(new Date().toISOString())
    if (date && date > today) return { facts: { available: false, reason: "That date hasn't happened yet." } }

    const session = await createClient()
    const db = session as unknown as OrdersDb
    let query = db.from('orders').select(ORDER_SELECT).eq('tenant_id', ctx.tenantId).eq('daily_number', Number(digits))
    query = date ? query.eq('order_date', date) : query.gte('order_date', shiftDayKey(today, 1 - SEARCH_DAYS)).lte('order_date', today)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(SEARCH_DAYS)
    if (error) return { facts: { available: false, reason: 'Orders could not be read right now.' } }

    const rows = (data ?? []) as OrderRow[]
    if (rows.length === 0) {
      const where = date ? `on ${date}` : `in the last ${SEARCH_DAYS} days`
      return { facts: { available: false, reason: `No order #${digits} ${where} that this account can see.` } }
    }
    const [row, ...others] = rows
    const order = toOrder(row)

    const [items, history] = await Promise.all([
      db
        .from('order_items')
        .select('menu_item_name, quantity, subtotal, variation, addons')
        .eq('order_id', order.id)
        .limit(ORDER_ITEM_LIMIT + 20)
        .then((answer) => (answer.error ? [] : ((answer.data ?? []) as ItemRow[]).map(toItem))),
      fetchStoreActivity(session as unknown as ActivityRpcClient, ctx.tenantId, {
        subjectType: 'order',
        subjectRef: order.id,
        includeRoutine: true,
        limit: 50,
      }).then(
        (page): StoreActivityEvent[] => page.events,
        () => null,
      ),
    ])

    return buildOrderLookupResult({
      order,
      items,
      history,
      otherDays: others.flatMap((other) => (other.order_date ? [other.order_date] : [])),
      showCustomer: hasPermission(ctx.caller, 'customers'),
    })
  },
}
