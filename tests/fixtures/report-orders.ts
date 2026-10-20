/**
 * The report-order generator (plan §10.1–10.2): fast-check arbitraries for
 * storage-neutral `ReportOrder`s, and their projection onto platform Supabase
 * rows so a read-seam test can seed a fake database with the SAME orders a
 * pure engine test reasons about.
 *
 * Money is drawn in whole centavos and written as pesos, so every generated
 * figure is exactly representable and the invariants can demand equality to
 * the centavo. The mix is deliberately untidy, because real orders are:
 * reversed statuses, unpaid and over-paid ledgers, refunds, unrecorded lines,
 * edited orders whose lines drift from the bill, delivery discounts, NULL
 * branches and categories, money stored as text.
 */
import fc from 'fast-check'
import type { SaleChannel } from '@/lib/dashboard/sale-record'
import type { OrderDiscountPayload } from '@/lib/order-discount'
import { TABLE_NUMBER_FIELD_NAME } from '@/lib/order-table-number'
import type {
  PlatformOrderItemRow,
  PlatformOrderRow,
  PlatformPaymentRow,
} from '@/lib/reports/read/platform-order-row'
import type { ReportLine, ReportOrder, ReportPayment } from '@/lib/reports/sales-model'

export const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'refunded'] as const
const PAYMENT_STATUSES = ['pending', 'paid', 'verified', null] as const
const CHANNELS: readonly SaleChannel[] = ['counter', 'online', 'qr', 'app']
const ORDER_TYPES = ['Dine In', 'Pick Up', 'Delivery'] as const

/** A day in Manila (2026-10-01 00:00 +08:00), the default placing window. */
export const DEFAULT_WINDOW = {
  start: Date.parse('2026-09-30T16:00:00.000Z'),
  end: Date.parse('2026-10-01T16:00:00.000Z'),
} as const

export interface OrderWindow {
  /** Epoch ms, inclusive. */
  start: number
  /** Epoch ms, exclusive. */
  end: number
}

const pesos = (cents: number): number => cents / 100

/** True about `percent`% of the time. Drawn by fast-check, so a seed replays it. */
function chance(percent: number): fc.Arbitrary<boolean> {
  return fc.oneof(
    { weight: 100 - percent, arbitrary: fc.constant(false) },
    { weight: percent, arbitrary: fc.constant(true) },
  )
}

/** `arbitrary` about `percent`% of the time, otherwise null. */
function sometimes<T>(arbitrary: fc.Arbitrary<T>, percent: number): fc.Arbitrary<T | null> {
  return fc.oneof(
    { weight: 100 - percent, arbitrary: fc.constant(null) },
    { weight: percent, arbitrary },
  )
}

/** Menu prices repeat: equal subtotals make the allocation's tie-breaks matter. */
const MENU_PRICES_CENTS = [4_500, 9_900, 12_000, 33_300] as const

const lineDraft = fc.record({
  dish: fc.integer({ min: 0, max: 5 }),
  /** The dish was deleted from the menu: no menu row, only its name. */
  isDeleted: chance(10),
  /** Sold under an older name, or typed with other spacing and case. */
  nameVariant: fc.constantFrom(0, 0, 0, 0, 1, 2),
  category: sometimes(fc.integer({ min: 0, max: 2 }), 80),
  categoryVariant: fc.constantFrom(0, 0, 0, 1),
  quantity: fc.integer({ min: 1, max: 3 }),
  subtotalCents: fc.oneof(fc.integer({ min: 0, max: 60_000 }), fc.constantFrom(...MENU_PRICES_CENTS)),
})

const paymentDraft = fc.record({
  isRefund: chance(15),
  /** Paid, then handed straight back through the same method: a slice that nets to nothing. */
  isReturnedInFull: chance(8),
  share: fc.double({ min: 0, max: 1, noNaN: true }),
  method: sometimes(fc.integer({ min: 0, max: 2 }), 70),
  methodName: sometimes(fc.integer({ min: 0, max: 2 }), 80),
  /** The same method typed differently ("GCash", " gcash ", "G-Cash"). */
  methodNameVariant: fc.constantFrom(0, 0, 0, 1, 2),
  offsetMs: fc.integer({ min: 0, max: 6 * 60 * 60 * 1000 }),
})

const orderDraft = fc.record({
  lines: fc.array(lineDraft, { maxLength: 4 }),
  serviceCents: sometimes(fc.integer({ min: 1, max: 6_000 }), 30),
  deliveryCents: sometimes(fc.integer({ min: 1, max: 12_000 }), 30),
  /** Discount as basis points of the food, up to 30%. */
  discountBasisPoints: sometimes(fc.integer({ min: 1, max: 3_000 }), 30),
  discountTakesDelivery: fc.boolean(),
  /** A garbled payload claiming more off the delivery than the fee. */
  deliveryDiscountOverstated: chance(10),
  discountLabel: fc.constantFrom('Senior', 'PWD', 'Discount — x', 'Voucher SAVE10'),
  /** An edited order whose lines no longer add up to its bill. */
  driftCents: sometimes(fc.integer({ min: -2_500, max: 2_500 }), 10),
  payments: fc.array(paymentDraft, { maxLength: 2 }),
  status: fc.constantFrom(...ORDER_STATUSES),
  /** Stored spellings vary ("Cancelled", " paid "); readers fold them. */
  isOddlySpelled: chance(10),
  paymentStatus: fc.constantFrom(...PAYMENT_STATUSES),
  channel: fc.constantFrom(...CHANNELS),
  orderType: fc.constantFrom(...ORDER_TYPES),
  outlet: sometimes(fc.integer({ min: 0, max: 2 }), 70),
  hasTable: chance(30),
  checkoutMethod: sometimes(fc.constant('m-0'), 50),
  checkoutMethodName: sometimes(fc.constant('Cash'), 70),
  offsetFraction: fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
})

type OrderDraft = typeof orderDraft extends fc.Arbitrary<infer T> ? T : never

function discountFor(draft: OrderDraft, foodCents: number): { payload: OrderDiscountPayload | null; cents: number } {
  if (draft.discountBasisPoints === null) return { payload: null, cents: 0 }
  const cents = Math.floor((Math.max(foodCents, 100) * draft.discountBasisPoints) / 10_000)
  if (cents === 0) return { payload: null, cents: 0 }
  const deliveryDiscountCents =
    draft.discountTakesDelivery && draft.deliveryCents !== null ? Math.min(draft.deliveryCents, cents) : 0
  // Overstated: the payload asks for more off the delivery than the fee (the
  // readers cap it at the fee); the bill itself was charged correctly.
  const storedDeliveryCents = draft.deliveryDiscountOverstated ? deliveryDiscountCents + 1_500 : deliveryDiscountCents
  return {
    cents,
    payload: {
      total: pesos(cents),
      deliveryDiscount: pesos(storedDeliveryCents),
      lines: [{ label: draft.discountLabel, amount: pesos(cents) }],
      allocationsByLine: {},
    },
  }
}

function toOrder(draft: OrderDraft, index: number, window: OrderWindow): ReportOrder {
  const id = `o-${index}`
  const at = window.start + Math.floor(draft.offsetFraction * (window.end - window.start))
  const lines: ReportLine[] = draft.lines.map((line, i) => ({
    id: `${id}-l${i}`,
    menuItemId: line.isDeleted ? null : `dish-${line.dish}`,
    name: [`Dish ${line.dish}`, `Dish ${line.dish} (old)`, `dish  ${line.dish}`][line.nameVariant],
    categoryName: line.category === null ? null : [`Cat ${line.category}`, `cat  ${line.category}`][line.categoryVariant],
    quantity: line.quantity,
    subtotal: pesos(line.subtotalCents),
  }))
  const foodCents = draft.lines.reduce((sum, line) => sum + line.subtotalCents, 0)
  const discount = discountFor(draft, foodCents)
  const totalCents = Math.max(
    0,
    foodCents - discount.cents + (draft.serviceCents ?? 0) + (draft.deliveryCents ?? 0) + (draft.driftCents ?? 0),
  )
  const payments: ReportPayment[] = draft.payments.flatMap((payment) => {
    const row: ReportPayment = {
      kind: payment.isRefund ? 'refund' : 'charge',
      amount: pesos(Math.floor((totalCents * 0.8 + 100) * payment.share)),
      methodId: payment.method === null ? null : `m-${payment.method}`,
      methodName:
        payment.methodName === null
          ? null
          : [`Method ${payment.methodName}`, `  method ${payment.methodName} `, `METHOD-${payment.methodName}`][payment.methodNameVariant],
      at: at + payment.offsetMs,
    }
    if (!payment.isReturnedInFull || payment.isRefund) return [row]
    return [row, { ...row, kind: 'refund', at: row.at + 60_000 }]
  })
  const spell = (value: string) => (draft.isOddlySpelled ? ` ${value.charAt(0).toUpperCase()}${value.slice(1)} ` : value)

  return {
    id,
    at,
    status: spell(draft.status),
    paymentStatus: draft.paymentStatus === null ? null : spell(draft.paymentStatus),
    channel: draft.channel,
    orderType: draft.orderType,
    outletId: draft.outlet === null ? null : `b-${draft.outlet}`,
    hasTable: draft.hasTable,
    total: pesos(totalCents),
    serviceCharge: draft.serviceCents === null ? null : pesos(draft.serviceCents),
    deliveryFee: draft.deliveryCents === null ? null : pesos(draft.deliveryCents),
    discount: discount.payload,
    methodId: draft.checkoutMethod,
    methodName: draft.checkoutMethodName,
    payments,
    lines,
  }
}

export interface ReportOrdersOptions {
  minLength?: number
  maxLength?: number
  /** Where `at` falls. Defaults to one Manila day. */
  window?: OrderWindow
}

/** A list of orders with unique ids (`o-0`, `o-1`, …) placed inside `window`. */
export function reportOrdersArb({
  minLength = 1,
  maxLength = 25,
  window = DEFAULT_WINDOW,
}: ReportOrdersOptions = {}): fc.Arbitrary<ReportOrder[]> {
  return fc
    .array(orderDraft, { minLength, maxLength })
    .map((drafts) => drafts.map((draft, index) => toOrder(draft, index, window)))
}

// ---------------------------------------------------------------------------
// Projection onto platform Supabase rows (the inverse of `toReportOrder`).
// ---------------------------------------------------------------------------

/** What `toSaleChannel` reads each channel back from. */
const CHANNEL_SOURCES: Readonly<Record<SaleChannel, string>> = {
  counter: 'pos',
  online: 'web',
  qr: 'qr_handoff',
  app: 'mobile',
}

const ORDER_TYPE_VALUES: Readonly<Record<string, string>> = {
  'Dine In': 'dine_in',
  'Pick Up': 'pickup',
  Delivery: 'delivery',
}

export interface PlatformOrderSeed {
  orders: Array<PlatformOrderRow & { tenant_id: string }>
  items: Array<PlatformOrderItemRow & { tenant_id: string }>
  payments: Array<PlatformPaymentRow & { tenant_id: string }>
}

export interface PlatformProjection {
  tenantId: string
  /** Write money as text (`"123.45"`), as a numeric can come back. */
  moneyAsText?: boolean
  /** Keep the discount in the POS blob instead of the `discount_data` column. */
  discountInBlob?: boolean
}

function money(value: number | string | null, asText: boolean): number | string | null {
  if (value === null || !asText) return value
  return Number(value).toFixed(2)
}

/** One order as the three platform tables hold it. */
export function toPlatformRows(order: ReportOrder, projection: PlatformProjection): PlatformOrderSeed {
  const { tenantId, moneyAsText = false, discountInBlob = false } = projection
  const customerData: Record<string, unknown> = {
    ...(order.hasTable ? { [TABLE_NUMBER_FIELD_NAME]: '5' } : {}),
    ...(discountInBlob && order.discount ? { discount: order.discount } : {}),
  }
  return {
    orders: [
      {
        id: order.id,
        tenant_id: tenantId,
        created_at: new Date(order.at).toISOString(),
        status: order.status,
        payment_status: order.paymentStatus,
        source: CHANNEL_SOURCES[order.channel],
        order_type: ORDER_TYPE_VALUES[order.orderType] ?? order.orderType,
        outlet_id: order.outletId,
        total: money(order.total, moneyAsText),
        service_charge_amount: money(order.serviceCharge, moneyAsText),
        delivery_fee: money(order.deliveryFee, moneyAsText),
        discount_data: discountInBlob ? null : order.discount,
        customer_data: customerData,
        payment_method_id: order.methodId,
        payment_method_name: order.methodName,
      },
    ],
    items: order.lines.map((line) => ({
      id: line.id,
      tenant_id: tenantId,
      order_id: order.id,
      menu_item_id: line.menuItemId,
      menu_item_name: line.name,
      category_name: line.categoryName,
      quantity: line.quantity,
      subtotal: money(line.subtotal, moneyAsText),
    })),
    payments: order.payments.map((payment) => ({
      tenant_id: tenantId,
      order_id: order.id,
      kind: payment.kind,
      amount: money(payment.amount, moneyAsText),
      payment_method_id: payment.methodId,
      payment_method_name: payment.methodName,
      created_at: new Date(payment.at).toISOString(),
    })),
  }
}

/** Every order's rows, table by table, ready for `fakeSupabaseTables`. */
export function toPlatformTables(orders: readonly ReportOrder[], projection: PlatformProjection): PlatformOrderSeed {
  const seeds = orders.map((order, index) =>
    toPlatformRows(order, {
      ...projection,
      // Alternate where the discount lives so both reader paths are exercised.
      discountInBlob: projection.discountInBlob ?? index % 2 === 1,
    }),
  )
  return {
    orders: seeds.flatMap((seed) => seed.orders),
    items: seeds.flatMap((seed) => seed.items),
    payments: seeds.flatMap((seed) => seed.payments),
  }
}
