/**
 * The shift sales report (CONTRACTS §4, §5): what one shift, or one window of
 * the business day, sold. The numbers come from `report_shift_sales` /
 * `report_period_sales`, which are built only on the existing `reporting.*`
 * helpers, so this file adds NO revenue formula: it parses and splits.
 *
 * - `source: 'unavailable'` = the store's orders are not in the platform
 *   database (Convex / tenant Supabase). Screens say so; they never show ₱0.
 * - `hidden: true` = a blind count still open, read by someone who is not a
 *   cash manager: every money field is null, the receipt list stays.
 *
 * Web twin of `webnegosyo-app/lib/cash/shift-sales.ts` (owner: app-cashier).
 */

import { z } from 'zod'
import { callCashRpc, cashFailure, type CashResult, type CashRpcClient } from './cash-rpc'

export type { CashRpcClient, CashResult } from './cash-rpc'

const cents = z.number().int()
const count = z.number().int().nonnegative()
const iso = z.string().min(1)

const summarySchema = z.object({
  orders: count,
  grossCents: cents,
  discountCents: cents,
  netCents: cents,
  serviceChargeCents: cents,
  deliveryCents: cents,
  collectedCents: cents,
  unpaidCents: cents,
  overpaidCents: cents,
  voidCount: count,
  voidCents: cents,
  refundCents: cents,
})

const paymentSchema = z.object({ key: z.string(), label: z.string(), cents, count })
const groupSchema = z.object({ key: z.string(), label: z.string(), orders: count, netCents: cents })
const itemSchema = z.object({ label: z.string(), quantity: z.number().nonnegative(), netCents: cents })

export const RECEIPT_STATUSES = ['paid', 'unpaid', 'void', 'refunded'] as const
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

const receiptSchema = z.object({
  orderId: z.string().min(1),
  number: z.string(),
  placedAt: iso,
  orderTypeLabel: z.string().nullable().catch(null),
  methodLabel: z.string().nullable().catch(null),
  totalCents: cents.nullable(),
  status: z.enum(RECEIPT_STATUSES),
})

const shiftSchema = z.object({
  id: z.string().min(1),
  staffName: z.string().nullable().catch(null),
  drawerName: z.string().nullable().catch(null),
  openedAt: iso,
  closedAt: iso.nullable(),
  businessDay: z.string().nullable().catch(null),
  servicePeriodName: z.string().nullable().catch(null),
})

const serverReportSchema = z.object({
  source: z.literal('server'),
  hidden: z.boolean(),
  window: z.object({ from: iso, to: iso }),
  shift: shiftSchema.nullish(),
  summary: summarySchema.nullable(),
  payments: z.array(paymentSchema).nullable(),
  orderTypes: z.array(groupSchema).nullable(),
  channels: z.array(groupSchema).nullable(),
  items: z.array(itemSchema).nullable(),
  receipts: z.array(receiptSchema),
  receiptsTruncated: z.boolean(),
  firstNumber: z.string().nullable().catch(null),
  lastNumber: z.string().nullable().catch(null),
})

const unavailableSchema = z.object({ source: z.literal('unavailable') })

export type ShiftSalesSummary = z.infer<typeof summarySchema>
export type ShiftSalesPayment = z.infer<typeof paymentSchema>
export type ShiftSalesGroup = z.infer<typeof groupSchema>
export type ShiftSalesItem = z.infer<typeof itemSchema>
export type ShiftSalesReceipt = z.infer<typeof receiptSchema>
export type ShiftSalesShift = z.infer<typeof shiftSchema>

export interface ShiftSalesReport {
  source: 'server' | 'unavailable'
  hidden: boolean
  window: { from: string; to: string } | null
  shift: ShiftSalesShift | null
  summary: ShiftSalesSummary | null
  payments: ShiftSalesPayment[] | null
  orderTypes: ShiftSalesGroup[] | null
  channels: ShiftSalesGroup[] | null
  items: ShiftSalesItem[] | null
  receipts: ShiftSalesReceipt[]
  receiptsTruncated: boolean
  firstNumber: string | null
  lastNumber: string | null
}

const UNAVAILABLE_REPORT: ShiftSalesReport = {
  source: 'unavailable',
  hidden: false,
  window: null,
  shift: null,
  summary: null,
  payments: null,
  orderTypes: null,
  channels: null,
  items: null,
  receipts: [],
  receiptsTruncated: false,
  firstNumber: null,
  lastNumber: null,
}

/** Parse the RPC's JSON. Throws on anything outside the contract (the reader turns it into a result). */
export function parseShiftSalesReport(data: unknown): ShiftSalesReport {
  if (unavailableSchema.safeParse(data).success) return UNAVAILABLE_REPORT
  const parsed = serverReportSchema.parse(data)
  return { ...parsed, shift: parsed.shift ?? null }
}

/**
 * The register's own cash rule (`webnegosyo-app/lib/pos-payment-methods.ts`
 * CASH_NAME): a method is cash when "cash" or "cod" is a word of its name.
 * "GCash" is not cash; "Cash on delivery" is.
 */
const CASH_NAME = /(^|\s)(cash|cod)(\s|$)/i

export function isCashMethodLabel(label: string): boolean {
  return CASH_NAME.test(label)
}

export interface CashSplit {
  cashCents: number
  nonCashCents: number
}

/** Money in by cash vs everything else. Null (unknown) when the money is hidden or not loaded. */
export function cashAndNonCash(report: ShiftSalesReport): CashSplit | null {
  if (report.source !== 'server' || report.hidden || report.payments === null) return null
  return report.payments.reduce<CashSplit>(
    (split, payment) =>
      isCashMethodLabel(payment.label)
        ? { ...split, cashCents: split.cashCents + payment.cents }
        : { ...split, nonCashCents: split.nonCashCents + payment.cents },
    { cashCents: 0, nonCashCents: 0 },
  )
}

export const CASH_SALES_FORBIDDEN_MESSAGE = 'Only the cashier on this shift or someone who handles cash can see these sales.'
export const PERIOD_SALES_FORBIDDEN_MESSAGE = 'You need the Reports permission to see sales by shift. Ask the store owner.'
export const CASH_SALES_FAILED_MESSAGE = 'These sales couldn’t load. Try again in a moment.'

const UUID = z.string().uuid()

/** One shift's sales: the holder, or a cash manager who reaches its branch (the database decides). */
export function readShiftSales(client: CashRpcClient, shiftId: string): Promise<CashResult<ShiftSalesReport>> {
  if (!UUID.safeParse(shiftId).success) {
    return Promise.resolve(cashFailure('invalid', 'That shift can’t be found.'))
  }
  return callCashRpc(client, 'report_shift_sales', { p_shift_id: shiftId }, parseShiftSalesReport, {
    forbiddenMessage: CASH_SALES_FORBIDDEN_MESSAGE,
    failedMessage: CASH_SALES_FAILED_MESSAGE,
  })
}

export interface SalesWindow {
  tenantId: string
  /** Half-open [startIso, endIso). */
  startIso: string
  endIso: string
  /** null = every branch the caller reaches. */
  outletId: string | null
}

function isOrderedWindow(window: SalesWindow): boolean {
  const start = Date.parse(window.startIso)
  const end = Date.parse(window.endIso)
  return Number.isFinite(start) && Number.isFinite(end) && start < end
}

/** Sales in any window of the business day (needs `reports`): By shift, a past service period. */
export function readPeriodSales(client: CashRpcClient, window: SalesWindow): Promise<CashResult<ShiftSalesReport>> {
  if (!UUID.safeParse(window.tenantId).success || !isOrderedWindow(window)) {
    return Promise.resolve(cashFailure('invalid', 'That time window can’t be read.'))
  }
  const args: Record<string, unknown> = {
    p_tenant: window.tenantId,
    p_from: new Date(window.startIso).toISOString(),
    p_to: new Date(window.endIso).toISOString(),
    // Left out (not null) when no branch is picked: the function's default applies.
    ...(window.outletId ? { p_outlet: window.outletId } : {}),
  }
  return callCashRpc(client, 'report_period_sales', args, parseShiftSalesReport, {
    forbiddenMessage: PERIOD_SALES_FORBIDDEN_MESSAGE,
    failedMessage: CASH_SALES_FAILED_MESSAGE,
  })
}
