import type { AppOrderStatus } from '@/lib/contract'
import { isTerminalStatus } from './status'

/** How often an open order screen re-reads a live order (push replaces this in Phase 7). */
export const ORDER_POLL_MS = 15_000

interface PollInput {
  status: AppOrderStatus | undefined
  /** The order screen is the one on top. */
  isFocused: boolean
  /** The app is in the foreground. */
  isAppActive: boolean
}

/** The refetch interval for the order screen: only while someone can see it and the order can still change. */
export function orderPollInterval({ status, isFocused, isAppActive }: PollInput): number | false {
  if (!isFocused || !isAppActive) return false
  if (status && isTerminalStatus(status)) return false
  return ORDER_POLL_MS
}
