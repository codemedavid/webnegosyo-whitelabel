/**
 * Reading an order rung up for a Messenger chat, the way the summary, the
 * customer's taps and the staff quick actions all see it (service role,
 * always scoped to one store by the caller). One reader, so "paid", the
 * dish lines and the totals mean the same thing in every message.
 */

import 'server-only'
import { toCentavos } from './chat-cart'
import { chatOrderLineDetail, type ChatOrderLine, type ChatOrderRow, type ChatOrderView, type PayChoice } from './chat-order'
import { isUuid } from './ids'
import { isPaidStatus } from './money'
import { orderLabel } from './order-view'
import { messengerDb } from './service-db'

const ORDER_COLUMNS =
  'id, tenant_id, status, daily_number, order_type, order_type_id, total, payment_status, source, item_count, delivery_fee, service_charge_amount, discount_total, customer_data, revision_number'

export interface OrderRow {
  id: string
  tenant_id: string
  status: string
  daily_number: number | null
  order_type: string | null
  order_type_id: string | null
  total: number | string | null
  payment_status: string | null
  source: string | null
  item_count: number | null
  delivery_fee: number | string | null
  service_charge_amount: number | string | null
  discount_total: number | string | null
  customer_data: Record<string, unknown> | null
  revision_number: number | null
}

interface ItemRow {
  menu_item_name: string | null
  variation: string | null
  addons: unknown
  variation_selections: unknown
  quantity: number | null
  subtotal: number | string | null
  special_instructions: string | null
}

/**
 * The register writes the order, then its dishes in a second request. The
 * trigger fires on the first, so the dishes can be a moment behind: wait for
 * them this long (in all ~7 s) before giving up.
 */
const ITEM_WAITS_MS = [800, 1200, 2000, 3000]

const pesos = (value: number | string | null | undefined): number => toCentavos(Number(value) || 0)
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function toLine(row: ItemRow): ChatOrderLine {
  const detail = chatOrderLineDetail(row)
  return {
    name: (row.menu_item_name ?? '').trim() || 'Item',
    qty: Math.max(1, Number(row.quantity) || 1),
    lineCentavos: pesos(row.subtotal),
    ...(detail ? { detail } : {}),
  }
}

export function toChatOrderView(row: OrderRow, lines: ChatOrderLine[], hasPaymentMethod: boolean): ChatOrderView {
  const fee = pesos(row.delivery_fee)
  const service = pesos(row.service_charge_amount)
  const discount = pesos(row.discount_total)
  return {
    id: row.id,
    label: orderLabel(row.daily_number, row.id),
    status: row.status,
    orderType: row.order_type?.trim() || null,
    lines,
    adjustments: [
      ...(discount > 0 ? [{ label: 'Discount', centavos: -discount }] : []),
      ...(service > 0 ? [{ label: 'Service charge', centavos: service }] : []),
      ...(fee > 0 ? [{ label: 'Delivery fee', centavos: fee }] : []),
    ],
    totalCentavos: pesos(row.total),
    isPaid: isPaidStatus(row.payment_status),
    hasPaymentMethod,
    revision: row.revision_number ?? 0,
  }
}

async function readItems(orderId: string): Promise<ItemRow[]> {
  const { data, error } = await messengerDb()
    .from('order_items')
    .select('menu_item_name, variation, addons, variation_selections, quantity, subtotal, special_instructions')
    .eq('order_id', orderId)
    .order('id', { ascending: true })
    .limit(200)
  if (error) throw new Error(`order items not readable: ${error.code}`)
  return (data ?? []) as ItemRow[]
}

export async function readOrderRow(orderId: string, tenantId?: string): Promise<OrderRow | null> {
  let query = messengerDb().from('orders').select(ORDER_COLUMNS).eq('id', orderId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`order not readable: ${error.code}`)
  return (data as OrderRow | null) ?? null
}

/** The chat the register named on the order (`customer_data.messenger_session_id`); only register orders name one. */
function namedSession(row: OrderRow): string | null {
  const named = row.customer_data?.messenger_session_id
  return row.source === 'pos' && isUuid(named) ? named : null
}

/**
 * The order with its dishes. `waitForDishes`: when the dishes are not there
 * yet, wait for the register's second request (the summary route only, in
 * `after()`; never on a request someone is waiting on).
 */
export async function readChatOrder(orderId: string, options: { waitForDishes?: boolean } = {}): Promise<ChatOrderRow | null> {
  const row = await readOrderRow(orderId)
  if (!row) return null
  const sessionId = namedSession(row)
  if (!sessionId) return { ...toChatOrderView(row, [], false), tenantId: row.tenant_id, sessionId: null }
  let items = await readItems(orderId)
  if (options.waitForDishes) {
    for (const ms of ITEM_WAITS_MS) {
      if (items.length > 0 || (row.item_count ?? 0) === 0) break
      await wait(ms)
      items = await readItems(orderId)
    }
  }
  // The status may have moved while we waited (staff pushed it through).
  const fresh = options.waitForDishes && items.length > 0 ? (await readOrderRow(orderId)) ?? row : row
  return { ...toChatOrderView(fresh, items.map(toLine), false), tenantId: row.tenant_id, sessionId }
}

interface MethodRow {
  id: string
  name: string | null
  details: string | null
  qr_code_url: string | null
  payment_method_order_types: Array<{ order_type_id: string }> | null
}

export type PayChoiceWithQr = PayChoice & { qrCodeUrl: string | null }

/** The active methods checkout offers for the order's type (an order with no type: every active method). */
export async function loadPayChoices(tenantId: string, orderTypeId: string | null): Promise<PayChoiceWithQr[]> {
  const { data, error } = await messengerDb()
    .from('payment_methods')
    .select('id, name, details, qr_code_url, payment_method_order_types(order_type_id)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
    .limit(30)
  if (error) {
    console.error('[Messenger chat order] payment methods not readable', { code: error.code })
    return []
  }
  return ((data ?? []) as unknown as MethodRow[])
    .filter((row) => !orderTypeId || (row.payment_method_order_types ?? []).some((link) => link.order_type_id === orderTypeId))
    .filter((row) => (row.name ?? '').trim().length > 0)
    .map((row) => ({ id: row.id, name: (row.name ?? '').trim(), details: (row.details ?? '').trim(), qrCodeUrl: row.qr_code_url }))
}

export const toPayChoice = (method: PayChoice): PayChoice => ({ id: method.id, name: method.name, details: method.details })
