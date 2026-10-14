/**
 * The Rules tab's checks, in the owner's words. Quiet hours must cover at
 * least 9 PM–7 AM (the NTC promo rule, enforced by the server too). There is
 * deliberately no opt-out line field (see rulesForSave). Pure.
 */

import { PER_WINDOW, WINDOW_MINUTES } from '@/lib/sms-automations/eta'
import { isInQuietHours } from './composer-draft'
import type { TextingRules } from './automations'

const FLOOR_START_MIN = 21 * 60
const FLOOR_END_MIN = 7 * 60
const DAY_MIN = 24 * 60
const HIGH_DAILY_LIMIT = 200
const MAX_REVIEW_URL = 300
const REVIEW_URL = /^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i

export const RULE_HINTS = {
  quietHours: 'Philippine time. Texts that come due at night wait until morning. None are lost.',
  guestCap: 'However many texts want the same guest, they hear from you at most once in this time.',
  dailyLimit: 'The most your phone sends in a day. Carriers can block a SIM that sends too many.',
  reviewUrl: 'Your Google or Facebook review page. The review request text links to it.',
} as const

export const PACE_LINE = `Your phone sends about ${PER_WINDOW} every ${WINDOW_MINUTES} minutes. This keeps your number safe and can't be changed.`

function hhmm(minute: number): string {
  const m = ((minute % DAY_MIN) + DAY_MIN) % DAY_MIN
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** True when the window is quiet for every minute from 9 PM to 7 AM. */
export function coversQuietFloor(rules: Pick<TextingRules, 'quietHoursStart' | 'quietHoursEnd'>): boolean {
  if (rules.quietHoursStart === rules.quietHoursEnd) return false
  for (let minute = FLOOR_START_MIN; minute < DAY_MIN + FLOOR_END_MIN; minute += 1) {
    if (!isInQuietHours(hhmm(minute), rules)) return false
  }
  return true
}

export function quietHoursProblem(rules: Pick<TextingRules, 'quietHoursStart' | 'quietHoursEnd'>): string | null {
  if (coversQuietFloor(rules)) return null
  return "Quiet hours must cover at least 9 PM to 7 AM. That's the rule for promo texts in the Philippines."
}

export function dailyLimitNote(limit: number): string | null {
  return limit > HIGH_DAILY_LIMIT ? 'High for one SIM. Consider a second phone.' : null
}

export function reviewUrlProblem(raw: string): string | null {
  const value = raw.trim()
  if (value === '') return null
  if (value.length > MAX_REVIEW_URL || !REVIEW_URL.test(value)) return 'Paste the full review link, starting with https://'
  return null
}

export function numberProblem(value: number, min: number, max: number, label: string): string | null {
  return Number.isInteger(value) && value >= min && value <= max ? null : `${label} must be between ${min} and ${max}.`
}

export function rulesProblems(rules: TextingRules): Partial<Record<keyof TextingRules, string>> {
  const problems: Partial<Record<keyof TextingRules, string>> = {}
  const quiet = quietHoursProblem(rules)
  if (quiet) problems.quietHoursStart = quiet
  const cap = numberProblem(rules.guestCapDays, 1, 30, 'Days between texts')
  if (cap) problems.guestCapDays = cap
  const limit = numberProblem(rules.dailyLimit, 1, 500, 'The daily limit')
  if (limit) problems.dailyLimit = limit
  const review = reviewUrlProblem(rules.reviewUrl ?? '')
  if (review) problems.reviewUrl = review
  return problems
}

export function sameRules(a: TextingRules, b: TextingRules): boolean {
  return a.quietHoursStart === b.quietHoursStart && a.quietHoursEnd === b.quietHoursEnd
    && a.guestCapDays === b.guestCapDays && a.dailyLimit === b.dailyLimit
    && (a.reviewUrl ?? '').trim() === (b.reviewUrl ?? '').trim()
}

/**
 * What the server takes (`save_settings`). The opt-out line is not editable
 * here — nothing handles replies (the phone only sends), so offering "Reply
 * STOP" would promise guests something nobody honours (same as the app). A
 * line the store already has is passed through untouched.
 */
export function rulesForSave(rules: TextingRules): TextingRules {
  return { ...rules, reviewUrl: rules.reviewUrl?.trim() || null }
}
