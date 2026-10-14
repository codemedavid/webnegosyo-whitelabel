/**
 * What the web composer may save as a campaign (`CampaignDraftInput`). Pure.
 *
 * Mirrors the `sms_campaigns` checks (each schedule kind carries the field
 * that steers it — sms_campaigns_schedule_fields_ck) with messages an owner
 * can act on, plus the web's own rules: a name of 1..60, a message the
 * renderer can fill, and repeats that end within six months.
 *
 * "From now on" is NOT a schema rule — a draft may hold yesterday's date while
 * it is being edited. `checkScheduleTiming` is applied when it goes live.
 */

import { z } from 'zod'
import { validateCampaignTemplate } from './message'
import { isWithinQuietHours, manilaInstant, toManilaParts, type QuietWindow } from './schedule'
import { SCHEDULE_KINDS, type CampaignSchedule } from './types'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MAX_NAME = 60
const MAX_TEMPLATE = 459
const MAX_END_MONTHS = 6
/** "Send now" lands a minute or two after the composer picked the time. */
const PAST_GRACE_MS = 5 * 60_000

const knob = z.number().int().min(0).max(3650).optional()

export const audienceFilterSchema = z.strictObject({
  lastOrderOlderThanDays: knob,
  lastOrderWithinDays: knob,
  minOrderCount: knob,
  maxOrderCount: knob,
  minTotalSpent: z.number().min(0).max(10_000_000).optional(),
  channels: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
})

const dateField = z.string().regex(YMD, 'Pick a date.')

export const campaignScheduleSchema = z.strictObject({
  kind: z.enum(SCHEDULE_KINDS),
  time: z.string().regex(HHMM, 'Pick a time.'),
  date: dateField.nullable(),
  intervalDays: z.number().int().min(1, 'Pick how many days apart.').max(90, 'Repeat at most every 90 days.').nullable(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  endsOn: dateField.nullable(),
})

/** The last day a repeat may be set to stop on: six calendar months from today (Manila). */
export function maxEndsOn(now: Date): string {
  const [year, month, day] = toManilaParts(now).date.split('-').map(Number)
  // Date.UTC rolls an overflowing month into the next year; read it back as a plain date.
  return new Date(Date.UTC(year, month - 1 + MAX_END_MONTHS, day)).toISOString().slice(0, 10)
}

type Issue = { path: (string | number)[]; message: string }

function scheduleIssues(schedule: CampaignSchedule, now: Date): Issue[] {
  const issues: Issue[] = []
  const at = (key: string, message: string) => issues.push({ path: ['schedule', key], message })
  if (schedule.kind === 'one_off' && !schedule.date) at('date', 'Pick a date.')
  if (schedule.kind === 'every_n_days' && !schedule.intervalDays) at('intervalDays', 'Pick how many days apart.')
  if (schedule.kind === 'weekly' && new Set(schedule.weekdays).size === 0) at('weekdays', 'Pick at least one day.')
  if (schedule.kind !== 'one_off') {
    if (!schedule.endsOn) at('endsOn', 'Pick when it stops.')
    else if (schedule.endsOn > maxEndsOn(now)) at('endsOn', `End it within ${MAX_END_MONTHS} months.`)
  }
  return issues
}

export const campaignDraftInputSchema = z.strictObject({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Give it a name only you will see.').max(MAX_NAME, `Keep the name under ${MAX_NAME} characters.`),
  messageTemplate: z.string().min(1, 'Write a message first.').max(MAX_TEMPLATE, `Keep the message under ${MAX_TEMPLATE} characters (3 texts).`),
  audience: audienceFilterSchema,
  schedule: campaignScheduleSchema,
}).superRefine((input, ctx) => {
  const template = validateCampaignTemplate(input.messageTemplate)
  if (!template.ok) ctx.addIssue({ code: 'custom', path: ['messageTemplate'], message: template.error })
  for (const issue of scheduleIssues(input.schedule, new Date())) ctx.addIssue({ code: 'custom', ...issue })
})

export type ParsedCampaignDraft = z.infer<typeof campaignDraftInputSchema>

/** "21:00" → "9 PM", "07:30" → "7:30 AM". */
function clockWords(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''} ${hours < 12 ? 'AM' : 'PM'}`
}

/**
 * Going live: the send time is outside the store's quiet hours (when given), a
 * one-off is from now on, a repeat has not ended. Null = fine.
 */
export function checkScheduleTiming(schedule: CampaignSchedule, now: Date, quiet?: QuietWindow): string | null {
  if (quiet && isWithinQuietHours(schedule.time, quiet.start, quiet.end)) {
    return `That's inside quiet hours (${clockWords(quiet.start)}–${clockWords(quiet.end)}). Pick a time after ${clockWords(quiet.end)}.`
  }
  const today = toManilaParts(now).date
  if (schedule.kind === 'one_off') {
    const due = schedule.date ? manilaInstant(schedule.date, schedule.time) : null
    return !due || due.getTime() < now.getTime() - PAST_GRACE_MS ? 'Pick a time from now on.' : null
  }
  if (schedule.endsOn && schedule.endsOn < today) return 'Pick an end date from today on.'
  if (schedule.endsOn && schedule.endsOn > maxEndsOn(now)) return `End it within ${MAX_END_MONTHS} months.`
  return null
}
