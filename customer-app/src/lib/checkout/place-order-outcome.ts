import { AppApiError } from '@/lib/api/app-client'
import type { AppErrorCode, AppFieldError } from '@/lib/contract'

/** Said whenever the order may or may not exist: never invite a blind second tap. */
export const UNCONFIRMED_ORDER_MESSAGE = 'We couldn’t confirm your order. Check your orders before trying again.'

export type PlaceOrderFailure =
  /** The store said no on purpose; its message says what to change. Nothing was placed. */
  | { kind: 'refused'; code: 'refused'; message: string; fieldErrors: readonly AppFieldError[] }
  /** Nothing was placed and the reason is safe to show (bad input, rate limit, signed out…). */
  | { kind: 'rejected'; code: AppErrorCode; message: string }
  /** Still placing, lost answer or outage: the order may exist. */
  | { kind: 'unconfirmed'; code: AppErrorCode | null; message: string }

/** Codes after which the order might have been placed. */
const MAYBE_PLACED: ReadonlySet<AppErrorCode> = new Set(['conflict', 'unavailable', 'internal'])

export function placeOrderFailure(error: unknown): PlaceOrderFailure {
  if (!(error instanceof AppApiError)) return { kind: 'unconfirmed', code: null, message: UNCONFIRMED_ORDER_MESSAGE }
  if (error.code === 'refused') return { kind: 'refused', code: 'refused', message: error.message, fieldErrors: error.fieldErrors }
  if (MAYBE_PLACED.has(error.code)) return { kind: 'unconfirmed', code: error.code, message: UNCONFIRMED_ORDER_MESSAGE }
  return { kind: 'rejected', code: error.code, message: error.message }
}
