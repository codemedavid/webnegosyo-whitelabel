/**
 * When will the last of N waiting texts go out? Pure.
 *
 * Mirrors the claim RPC's limits (claim_sms_outbox_message): one phone sends
 * at most `PER_WINDOW` texts per `WINDOW_MINUTES`, never during quiet hours,
 * and the store stops at its daily limit until Manila midnight. Assumes the
 * phone is on the whole time — the sheet says so.
 */

import { nextSendableAt } from './quiet-hours'

export const PER_WINDOW = 25
export const WINDOW_MINUTES = 30
const MINUTE_MS = 60_000
const MANILA_OFFSET_MS = 8 * 60 * MINUTE_MS
const DAY_MS = 24 * 60 * MINUTE_MS
/** Past this the answer is "a long time" — the UI says so instead of a date. */
const HORIZON_DAYS = 14

export interface DeliveryRules {
  quietHoursStart: string
  quietHoursEnd: string
  dailyLimit: number
}

export interface EtaInput {
  waiting: number
  /** Texts the store already sent today (Manila), counted against the daily limit. */
  sentToday: number
  now: Date
  rules: DeliveryRules
}

function manilaDay(instant: Date): number {
  return Math.floor((instant.getTime() + MANILA_OFFSET_MS) / DAY_MS)
}

function nextManilaMidnight(instant: Date): Date {
  return new Date((manilaDay(instant) + 1) * DAY_MS - MANILA_OFFSET_MS)
}

/** The instant the last batch starts sending, or null beyond two weeks. */
export function estimateDeliveryFinish({ waiting, sentToday, now, rules }: EtaInput): Date | null {
  let remaining = Math.max(0, Math.floor(waiting))
  if (remaining === 0) return now
  const horizon = now.getTime() + HORIZON_DAYS * DAY_MS
  let at = now
  let day = manilaDay(now)
  let leftToday = Math.max(0, rules.dailyLimit - sentToday)

  while (at.getTime() <= horizon) {
    at = nextSendableAt(at, rules.quietHoursStart, rules.quietHoursEnd)
    if (manilaDay(at) !== day) {
      day = manilaDay(at)
      leftToday = rules.dailyLimit
    }
    if (leftToday <= 0) {
      at = nextManilaMidnight(at)
      continue
    }
    const batch = Math.min(PER_WINDOW, remaining, leftToday)
    remaining -= batch
    leftToday -= batch
    if (remaining === 0) return at.getTime() <= horizon ? at : null
    at = new Date(at.getTime() + WINDOW_MINUTES * MINUTE_MS)
  }
  return null
}
