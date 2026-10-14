/**
 * The composer's working copy of a campaign and how it becomes the
 * CampaignDraftInput the server saves. "Now" is a one-off dated this minute;
 * repeats always carry an end day (default 8 weeks, at most ~6 months). Pure.
 */

import type { AudienceFilter, CampaignDraftInput, CampaignListItem, CampaignSchedule, WhenChoice } from '../types'
import type { CampaignPreset } from './presets'
import { addDays, manilaHhmm, manilaInstant, manilaToday, monthDayText, time12h } from './time'

export const DEFAULT_REPEAT_WEEKS = 8
export const MAX_REPEAT_DAYS = 180
const MAX_NAME = 60
const DEFAULT_TIME = '10:00'
const DEFAULT_INTERVAL_DAYS = 14
const DEFAULT_WEEKDAYS = [5]

export type RepeatKind = 'every_n_days' | 'weekly'

export interface ComposerDraft {
  id?: string
  name: string
  messageTemplate: string
  audience: AudienceFilter
  when: WhenChoice
  /** "YYYY-MM-DD" Manila, for Later. */
  laterDate: string
  /** "HH:MM" Manila, for Later and Repeat. */
  time: string
  repeatKind: RepeatKind
  intervalDays: number
  weekdays: number[]
  endsOn: string
}

function defaults(now: number): Omit<ComposerDraft, 'name' | 'messageTemplate' | 'audience'> {
  const today = manilaToday(now)
  return {
    when: 'now',
    laterDate: addDays(today, 1),
    time: DEFAULT_TIME,
    repeatKind: 'weekly',
    intervalDays: DEFAULT_INTERVAL_DAYS,
    weekdays: [...DEFAULT_WEEKDAYS],
    endsOn: addDays(today, DEFAULT_REPEAT_WEEKS * 7),
  }
}

export function blankDraft(now: number): ComposerDraft {
  return { ...defaults(now), name: 'Untitled campaign', messageTemplate: '', audience: {} }
}

export function draftFromPreset(preset: CampaignPreset, now: number): ComposerDraft {
  const base = defaults(now)
  const isRepeat = preset.scheduleKind !== 'one_off'
  return {
    ...base,
    name: preset.name,
    messageTemplate: preset.messageTemplate,
    audience: { ...preset.audience },
    when: isRepeat ? 'repeat' : 'later',
    time: preset.time,
    repeatKind: preset.scheduleKind === 'every_n_days' ? 'every_n_days' : 'weekly',
    intervalDays: preset.intervalDays ?? base.intervalDays,
    weekdays: preset.weekdays.length > 0 ? [...preset.weekdays] : base.weekdays,
  }
}

export function draftFromItem(item: Pick<CampaignListItem, 'id' | 'name' | 'messageTemplate' | 'audience' | 'schedule'>, now: number): ComposerDraft {
  const base = defaults(now)
  const { schedule } = item
  const isRepeat = schedule.kind !== 'one_off'
  return {
    ...base,
    id: item.id,
    name: item.name,
    messageTemplate: item.messageTemplate,
    audience: { ...item.audience },
    when: isRepeat ? 'repeat' : 'later',
    laterDate: schedule.date ?? base.laterDate,
    time: schedule.time || base.time,
    repeatKind: schedule.kind === 'every_n_days' ? 'every_n_days' : 'weekly',
    intervalDays: schedule.intervalDays ?? base.intervalDays,
    weekdays: schedule.weekdays.length > 0 ? [...schedule.weekdays] : base.weekdays,
    endsOn: schedule.endsOn ?? base.endsOn,
  }
}

export function scheduleFor(draft: ComposerDraft, now: number): CampaignSchedule {
  if (draft.when === 'now') {
    return { kind: 'one_off', time: manilaHhmm(now), date: manilaToday(now), intervalDays: null, weekdays: [], endsOn: null }
  }
  if (draft.when === 'later') {
    return { kind: 'one_off', time: draft.time, date: draft.laterDate, intervalDays: null, weekdays: [], endsOn: null }
  }
  const isWeekly = draft.repeatKind === 'weekly'
  return {
    kind: draft.repeatKind,
    time: draft.time,
    date: null,
    intervalDays: isWeekly ? null : draft.intervalDays,
    weekdays: isWeekly ? [...draft.weekdays].sort((a, b) => a - b) : [],
    endsOn: draft.endsOn,
  }
}

export function draftToInput(draft: ComposerDraft, now: number): CampaignDraftInput {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    messageTemplate: draft.messageTemplate.trim(),
    audience: draft.audience,
    schedule: scheduleFor(draft, now),
  }
}

export function isDraftDirty(initial: ComposerDraft, current: ComposerDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current)
}

export function nameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Give it a name only you will see.'
  if (trimmed.length > MAX_NAME) return `Keep the name under ${MAX_NAME} characters.`
  return null
}

type QuietWindow = { quietHoursStart: string; quietHoursEnd: string }

/** Why the When section can't be saved, or null. A start inside quiet hours is refused (the server refuses it too). */
export function whenProblem(draft: ComposerDraft, now: number, rules?: QuietWindow): string | null {
  if (draft.when === 'now') return null
  if (!/^\d{2}:\d{2}$/.test(draft.time)) return 'Pick a time.'
  if (rules) {
    const quiet = quietTimeProblem(draft.time, rules)
    if (quiet) return quiet
  }
  const today = manilaToday(now)
  if (draft.when === 'later') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.laterDate)) return 'Pick a day.'
    return manilaInstant(draft.laterDate, draft.time) <= now ? 'Pick a time from now on.' : null
  }
  if (draft.repeatKind === 'weekly' && draft.weekdays.length === 0) return 'Pick at least one day.'
  if (draft.repeatKind === 'every_n_days' && !(draft.intervalDays >= 1 && draft.intervalDays <= 90)) return 'Repeat every 1 to 90 days.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endsOn)) return 'Pick the day it stops.'
  if (draft.endsOn < today) return 'Pick a stop day from today on.'
  const latest = addDays(today, MAX_REPEAT_DAYS)
  if (draft.endsOn > latest) return `Stop it within 6 months (by ${monthDayText(latest)}).`
  return null
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isInQuietHours(hhmm: string, rules: { quietHoursStart: string; quietHoursEnd: string }): boolean {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return false
  const at = minutesOf(hhmm)
  const from = minutesOf(rules.quietHoursStart)
  const to = minutesOf(rules.quietHoursEnd)
  if (from === to) return false
  return from < to ? at >= from && at < to : at >= from || at < to
}

/** "7:00 AM" → "7 AM", "07:30" → "7:30 AM". */
function clockWord(hhmm: string): string {
  return time12h(hhmm).replace(':00 ', ' ')
}

/** "That's inside quiet hours (9 PM–7 AM). Pick a time after 7 AM." — same words as the server. */
export function quietTimeProblem(hhmm: string, rules: QuietWindow): string | null {
  if (!isInQuietHours(hhmm, rules)) return null
  return `That's inside quiet hours (${clockWord(rules.quietHoursStart)}–${clockWord(rules.quietHoursEnd)}). Pick a time after ${clockWord(rules.quietHoursEnd)}.`
}

/** Only the times a campaign may start at: the quiet window is never offered. */
export function sendableTimes<T extends { value: string }>(options: readonly T[], rules: QuietWindow): T[] {
  return options.filter((option) => !isInQuietHours(option.value, rules))
}

/** The instant the first text could go: now, or the Later/Repeat start. */
export function startInstant(draft: ComposerDraft, now: number): number {
  if (draft.when === 'later') return manilaInstant(draft.laterDate, draft.time)
  return now
}
