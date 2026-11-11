import type { AppOrderKind, AppOrderStatus } from '@/lib/contract'
import { statusLabel } from './steps'

export type StatusTone = 'progress' | 'ready' | 'done' | 'cancelled'

export interface StatusPill {
  label: string
  tone: StatusTone
}

const TONE: Record<AppOrderStatus, StatusTone> = {
  pending: 'progress',
  confirmed: 'progress',
  preparing: 'progress',
  ready: 'ready',
  delivered: 'done',
  cancelled: 'cancelled',
}

/** The short status on an order card. */
export function statusPill(status: AppOrderStatus, kind: AppOrderKind): StatusPill {
  const label = status === 'cancelled' ? 'Cancelled' : status === 'pending' ? 'Placed' : statusLabel(status, kind)
  return { label, tone: TONE[status] }
}

/** Completed or cancelled: nothing will change, so the tracker stops refreshing. */
export function isTerminalStatus(status: AppOrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled'
}

/** The tracker just saw the order finish (a first read proves nothing: it may have finished long ago). */
export function hasJustFinished(previous: AppOrderStatus | undefined, next: AppOrderStatus): boolean {
  return previous !== undefined && !isTerminalStatus(previous) && isTerminalStatus(next)
}
