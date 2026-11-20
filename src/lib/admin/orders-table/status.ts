/**
 * Order statuses as the web Orders table names and moves them.
 *
 * One table for both order backends (platform Supabase and Convex), so the
 * words, tones and the "next step" button live here instead of in each
 * component. Before 2026-11-21 the list, the card, the dialog and the Convex
 * sheet each kept their own colour map and disagreed ("preparing" was orange,
 * amber and purple on three screens).
 *
 * `delivered` is shown as "Completed": a dine-in or pickup order is never
 * delivered, and the status means "handed over" for every order type.
 *
 * Pure: no I/O.
 */

export const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type StatusTone = 'new' | 'info' | 'warn' | 'ok' | 'muted' | 'bad'

export interface StatusMeta {
  label: string
  tone: StatusTone
}

export const STATUS_META: Readonly<Record<OrderStatus, StatusMeta>> = {
  pending: { label: 'New', tone: 'new' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  preparing: { label: 'Preparing', tone: 'warn' },
  ready: { label: 'Ready', tone: 'ok' },
  delivered: { label: 'Completed', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
}

/** Unknown values read as `pending`, the status every order starts in. */
export function toOrderStatus(value: unknown): OrderStatus {
  return isOrderStatus(value) ? value : 'pending'
}

export interface NextStatusStep {
  status: OrderStatus
  /** Button text: a verb, short enough for a table cell. */
  label: string
}

const NEXT_STEP: Readonly<Partial<Record<OrderStatus, NextStatusStep>>> = {
  pending: { status: 'confirmed', label: 'Confirm' },
  confirmed: { status: 'preparing', label: 'Start' },
  preparing: { status: 'ready', label: 'Ready' },
  ready: { status: 'delivered', label: 'Complete' },
}

/**
 * The one forward move offered on a row. Finished orders (completed,
 * cancelled) have none; going backwards or cancelling happens in the order
 * panel, where the cancel reason and its side effects are shown.
 */
export function nextStatusStep(status: OrderStatus): NextStatusStep | null {
  return NEXT_STEP[status] ?? null
}
