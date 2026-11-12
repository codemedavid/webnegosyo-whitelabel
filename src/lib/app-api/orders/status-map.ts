import { APP_PAYMENT_STATUSES, type AppOrderStatus } from '@/lib/app-contract'

/**
 * Backend status strings → the app contract's. All three order backends store
 * the same six order statuses (platform `orders_status_ck`, the tenant bundle
 * in `supabase-order-schema.ts`, Convex `orders.status`), so the map is mostly
 * identity; it exists so a stray spelling or a value from a future writer
 * never reaches a phone as something the app cannot draw.
 *
 * Payment statuses differ more: platform and tenant databases allow
 * pending/paid/failed/verified, Convex stores any string (pending, paid,
 * failed, verified in practice), and settlement code also knows `settled` and
 * `refunded`. `verified` is a proof the store checked = paid.
 *
 * Pure. Lookups use own properties only, so `__proto__` or `constructor` read
 * as unknown rather than as an object's prototype.
 */

export type AppPaymentStatus = (typeof APP_PAYMENT_STATUSES)[number]

const ORDER_STATUS_BY_BACKEND_VALUE: Readonly<Record<string, AppOrderStatus>> = {
  pending: 'pending',
  confirmed: 'confirmed',
  preparing: 'preparing',
  ready: 'ready',
  delivered: 'delivered',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

const PAYMENT_STATUS_BY_BACKEND_VALUE: Readonly<Record<string, AppPaymentStatus>> = {
  pending: 'pending',
  paid: 'paid',
  verified: 'paid',
  settled: 'paid',
  failed: 'failed',
  refunded: 'refunded',
}

const TERMINAL_ORDER_STATUSES: ReadonlySet<AppOrderStatus> = new Set(['delivered', 'cancelled'])

/** Digits shown for the store's daily number ("07"), as the web pads it. */
const ORDER_NUMBER_MIN_DIGITS = 2

function lookup<T>(table: Readonly<Record<string, T>>, raw: unknown): T | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null
}

/** The app's status for a backend value; null when the value is not one the platform writes. */
export function toAppOrderStatus(raw: unknown): AppOrderStatus | null {
  return lookup(ORDER_STATUS_BY_BACKEND_VALUE, raw)
}

/** The app's payment status; `unknown` when it could not be read or is not a known value. */
export function toAppPaymentStatus(raw: unknown): AppPaymentStatus {
  return lookup(PAYMENT_STATUS_BY_BACKEND_VALUE, raw) ?? 'unknown'
}

export function isTerminalOrderStatus(status: AppOrderStatus | null): boolean {
  return status !== null && TERMINAL_ORDER_STATUSES.has(status)
}

/**
 * The daily number as the app shows it: "07", "123". Null for anything that is
 * not a positive integer (Convex returns none at placement; old orders have none).
 * Same digits as `formatDailyOrderNumber`, without its "#" or the id fallback.
 */
export function formatAppOrderNumber(raw: unknown): string | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) return null
  return String(raw).padStart(ORDER_NUMBER_MIN_DIGITS, '0')
}
