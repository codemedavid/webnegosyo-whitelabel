/**
 * "When will the last text go out?" for the composer, wrapping the same
 * estimator the server uses (claim pace, quiet hours, daily limit). Assumes
 * the phone stays on — the copy says "about". Pure.
 */

import { estimateDeliveryFinish, PER_WINDOW, WINDOW_MINUTES } from '@/lib/sms-automations/eta'
import { finishText, manilaDay, time12h } from './time'

const FEW_MINUTES_MS = 10 * 60_000
const HOUR_MIN = 60

export interface FinishInput {
  texts: number
  /** When the first text may go (now, or the scheduled start). */
  start: number
  now: number
  /** Send now: texts already waiting go first. */
  isNow: boolean
  waitingAhead: number
  sentToday: number
  rules: { quietHoursStart: string; quietHoursEnd: string; dailyLimit: number }
  /** The phone is late, offline or missing: no promised times, only the pace. */
  isPhoneAway?: boolean
}

export interface FinishEstimate {
  text: string
  finishAt: number | null
  isLimitBound: boolean
  queueNote: string | null
}

function durationText(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < HOUR_MIN) return `${minutes} min`
  const hours = Math.floor(minutes / HOUR_MIN)
  const rest = minutes % HOUR_MIN
  const hourPart = `${hours} ${hours === 1 ? 'hr' : 'hrs'}`
  return rest === 0 ? hourPart : `${hourPart} ${rest} min`
}

/** Without a phone checking in nothing can be promised by the clock — only the pace. */
function awayEstimate(count: string, spanMs: number, isLimitBound: boolean, limit: number, days: number, queueNote: string | null): FinishEstimate {
  if (isLimitBound) return { text: `${count} · takes about ${days} days at your limit of ${limit} once your phone is back`, finishAt: null, isLimitBound, queueNote }
  if (spanMs <= FEW_MINUTES_MS) return { text: `${count} · a few minutes once your phone is back`, finishAt: null, isLimitBound, queueNote }
  return { text: `${count} · about ${durationText(spanMs)} once your phone is back`, finishAt: null, isLimitBound, queueNote }
}

export function finishEstimate(input: FinishInput): FinishEstimate | null {
  const { texts, start, now, isNow, rules } = input
  if (texts <= 0) return null
  const ahead = isNow ? Math.max(0, input.waitingAhead) : 0
  const sentToday = manilaDay(start) === manilaDay(now) ? input.sentToday : 0
  const waiting = texts + ahead
  const finish = estimateDeliveryFinish({ waiting, sentToday, now: new Date(start), rules })
  const count = `${texts.toLocaleString('en-US')} ${texts === 1 ? 'text' : 'texts'}`
  const queueNote = ahead > 0 ? `${ahead.toLocaleString('en-US')} ${ahead === 1 ? 'text is' : 'texts are'} already in line ahead of it.` : null
  const isLimitBound = waiting + sentToday > rules.dailyLimit
  if (!finish) {
    return { text: `${count} · takes more than two weeks at your limit of ${rules.dailyLimit}`, finishAt: null, isLimitBound: true, queueNote }
  }
  const at = finish.getTime()
  if (input.isPhoneAway) return awayEstimate(count, at - start, isLimitBound, rules.dailyLimit, manilaDay(at) - manilaDay(start) + 1, queueNote)
  const done = `done ${finishText(at, now)}`
  if (isLimitBound) {
    const days = manilaDay(at) - manilaDay(start) + 1
    return { text: `${count} · takes about ${days} days at your limit of ${rules.dailyLimit} · ${done}`, finishAt: at, isLimitBound, queueNote }
  }
  if (manilaDay(at) !== manilaDay(start) || at - start > 18 * 3_600_000) {
    const resume = time12h(rules.quietHoursEnd)
    return { text: `${count} · rests during quiet hours, continues at ${resume} · ${done}`, finishAt: at, isLimitBound, queueNote }
  }
  if (at - start <= FEW_MINUTES_MS) {
    return { text: `${count} · all out within a few minutes`, finishAt: at, isLimitBound, queueNote }
  }
  return {
    text: `${count} · about ${durationText(at - start)} at ${PER_WINDOW} every ${WINDOW_MINUTES} min · ${done}`,
    finishAt: at,
    isLimitBound,
    queueNote,
  }
}
