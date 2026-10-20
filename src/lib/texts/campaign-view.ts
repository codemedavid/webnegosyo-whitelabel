/**
 * What the Texts page shows for one campaign. Pure.
 *
 * The chip (`CampaignDisplayState`) is derived from the stored row + its runs
 * + whether a phone is ready, never stored. Order matters in
 * `deriveDisplayState`: an owner's explicit state (archived, draft, paused)
 * beats whatever the schedule says. Every label reads the Manila wall clock.
 */

import { audienceLabelOf, matchAudiencePreset } from './audience'
import { audienceFilterSchema } from './campaign-schema'
import { nextServerDueAt, toManilaParts, type QuietWindow, type RunStatus, type ServerDue } from './schedule'
import type {
  AudienceFilter, CampaignDelivery, CampaignDisplayState, CampaignListItem, CampaignPauseReason, CampaignResults,
  CampaignRowStatus, CampaignRunProgress, CampaignSchedule, ScheduleKind,
} from './types'

export const CAMPAIGN_COLUMNS =
  'id, name, message_template, audience, schedule_kind, schedule_time, schedule_date, schedule_interval_days, ' +
  'schedule_weekdays, ends_on, status, delivery, pause_reason, scheduled_from, created_at, updated_at'

export interface CampaignRecord {
  id: string
  name: string
  messageTemplate: string
  audience: AudienceFilter
  schedule: CampaignSchedule
  status: CampaignRowStatus
  delivery: CampaignDelivery
  pauseReason: CampaignPauseReason
  scheduledFrom: string | null
  createdAt: string
  updatedAt: string
}

export interface RunRecord {
  id: string
  campaignId: string
  status: RunStatus
  delivery: CampaignDelivery
  dueAt: string
  startedAt: string | null
  completedAt: string | null
}

const STATUSES: readonly CampaignRowStatus[] = ['draft', 'active', 'paused', 'archived', 'scheduled']
const KINDS: readonly ScheduleKind[] = ['one_off', 'every_n_days', 'weekly']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAY_MS = 86_400_000
/** Within this, "Starts Fri"; beyond, "Starts Oct 30". */
const WEEKDAY_LABEL_WINDOW_DAYS = 6
const PREVIEW_MAX = 120
const NONE = '—'

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(value) ? (value as T) : fallback
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

function audienceOf(raw: unknown): AudienceFilter {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const known = Object.fromEntries(Object.entries(raw).filter(([key]) => key in audienceFilterSchema.shape))
  const parsed = audienceFilterSchema.safeParse(known)
  return parsed.success ? parsed.data : {}
}

/** Row → record; an unknown status reads as archived (never live), matching the app's safety valve. */
export function campaignFromRow(row: Record<string, unknown>): CampaignRecord | null {
  if (typeof row.id !== 'string') return null
  const weekdays = Array.isArray(row.schedule_weekdays) ? row.schedule_weekdays.filter((d): d is number => typeof d === 'number') : []
  return {
    id: row.id,
    name: str(row.name) ?? '',
    messageTemplate: str(row.message_template) ?? '',
    audience: audienceOf(row.audience),
    schedule: {
      kind: oneOf(KINDS, row.schedule_kind, 'one_off'),
      time: str(row.schedule_time) ?? '10:00',
      date: str(row.schedule_date),
      intervalDays: typeof row.schedule_interval_days === 'number' ? row.schedule_interval_days : null,
      weekdays,
      endsOn: str(row.ends_on),
    },
    status: oneOf(STATUSES, row.status, 'archived'),
    delivery: row.delivery === 'server' ? 'server' : 'phone',
    pauseReason: row.pause_reason === 'owner' || row.pause_reason === 'missed_no_phone' ? row.pause_reason : null,
    scheduledFrom: str(row.scheduled_from),
    createdAt: str(row.created_at) ?? '',
    updatedAt: str(row.updated_at) ?? '',
  }
}

export interface DisplayInput {
  status: CampaignRowStatus
  delivery: CampaignDelivery
  schedule: CampaignSchedule
  hasAnyRun: boolean
  hasOpenRun: boolean
  isPhoneReady: boolean
  due: ServerDue
}

function liveState(input: DisplayInput): CampaignDisplayState {
  if (input.hasOpenRun) return input.isPhoneReady ? 'sending' : 'waiting_for_phone'
  const isOneOff = input.schedule.kind === 'one_off'
  if (input.due.state === 'finished') return isOneOff && !input.hasAnyRun ? 'scheduled' : isOneOff ? 'sent' : 'finished'
  if ((input.due.state === 'due' || input.due.state === 'missed') && !input.isPhoneReady) return 'waiting_for_phone'
  return isOneOff ? 'scheduled' : 'repeating'
}

export function deriveDisplayState(input: DisplayInput): CampaignDisplayState {
  if (input.status === 'archived') return 'archived'
  if (input.status === 'draft') return 'draft'
  if (input.status === 'paused') return 'paused'
  if (input.delivery === 'phone') return 'app_managed'
  return liveState(input)
}

// ─── Labels ──────────────────────────────────────────────────────────────────

/** "15:30" → "3:30 PM". */
export function formatManilaTime(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

function formatDate(ymd: string): string {
  const [, month, day] = ymd.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}`
}

/** "Oct 12, 10:00 AM" in Manila. */
export function formatManilaDateTime(iso: string): string {
  const parts = toManilaParts(new Date(iso))
  return `${formatDate(parts.date)}, ${formatManilaTime(parts.time)}`
}

function startsLabel(iso: string, now: Date): string {
  const parts = toManilaParts(new Date(iso))
  const isSoon = Date.parse(iso) - now.getTime() <= WEEKDAY_LABEL_WINDOW_DAYS * DAY_MS
  const day = isSoon ? WEEKDAY_SHORT[parts.weekday - 1] : formatDate(parts.date)
  return `Starts ${day}, ${formatManilaTime(parts.time)}`
}

function joinDays(names: readonly string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/** "Every Friday, 10:00 AM" / "Every Mon, Wed & Fri, 10:00 AM" / "Every 3 days, 5:00 PM". */
export function rhythmLabel(schedule: CampaignSchedule): string {
  const time = formatManilaTime(schedule.time)
  if (schedule.kind === 'every_n_days') {
    const days = schedule.intervalDays ?? 1
    return `Every ${days === 1 ? 'day' : `${days} days`}, ${time}`
  }
  if (schedule.kind === 'weekly') {
    const days = [...new Set(schedule.weekdays)].sort((a, b) => a - b)
    const names = days.length === 1 ? [WEEKDAY_LONG[days[0] - 1]] : days.map((d) => WEEKDAY_SHORT[d - 1])
    return `Every ${joinDays(names)}, ${time}`
  }
  return schedule.date ? `${formatDate(schedule.date)}, ${time}` : NONE
}

export interface WhenInput {
  state: CampaignDisplayState
  schedule: CampaignSchedule
  nextSendAt: string | null
  lastSentAt: string | null
  now: Date
}

export function whenLabelOf({ state, schedule, nextSendAt, lastSentAt, now }: WhenInput): string {
  const isRepeat = schedule.kind !== 'one_off'
  switch (state) {
    case 'sent': return lastSentAt ? `Sent ${formatManilaDateTime(lastSentAt)}` : NONE
    case 'finished': return schedule.endsOn ? `Ended ${formatDate(schedule.endsOn)}` : NONE
    case 'repeating': case 'app_managed': return rhythmLabel(schedule)
    case 'scheduled': return nextSendAt ? startsLabel(nextSendAt, now) : rhythmLabel(schedule)
    case 'sending': case 'waiting_for_phone': return isRepeat ? rhythmLabel(schedule) : lastSentAt ? `Started ${formatManilaDateTime(lastSentAt)}` : rhythmLabel(schedule)
    case 'paused': return isRepeat ? rhythmLabel(schedule) : NONE
    default: return NONE
  }
}

export function messagePreviewOf(template: string): string {
  const firstLine = template.trim().split(/\r?\n/)[0]?.trim() ?? ''
  return firstLine.length > PREVIEW_MAX ? `${firstLine.slice(0, PREVIEW_MAX - 1)}…` : firstLine
}

export interface EditInput {
  status: CampaignRowStatus
  schedule: CampaignSchedule
  hasAnyRun: boolean
  hasOpenRun: boolean
}

/** Message/audience/schedule may change: not archived, nothing sending, and a one-off that never went out. */
export function isCampaignEditable({ status, schedule, hasAnyRun, hasOpenRun }: EditInput): boolean {
  if (status === 'archived' || hasOpenRun) return false
  return schedule.kind === 'one_off' ? !hasAnyRun : true
}

// ─── The list item ───────────────────────────────────────────────────────────

export interface ListItemContext {
  runs: readonly RunRecord[]
  progress: CampaignRunProgress | null
  results: CampaignResults | null
  isPhoneReady: boolean
  quietHours: QuietWindow
  now: Date
}

const isOpen = (run: RunRecord): boolean => run.status === 'pending' || run.status === 'running'

export function dueOf(campaign: CampaignRecord, runs: readonly RunRecord[], quietHours: QuietWindow, now: Date): ServerDue {
  return nextServerDueAt({
    schedule: campaign.schedule,
    scheduledFrom: campaign.scheduledFrom ? new Date(campaign.scheduledFrom) : null,
    createdAt: new Date(campaign.createdAt || now.toISOString()),
    runs: runs.map((run) => ({ dueAt: new Date(run.dueAt), status: run.status })),
    quietHours,
    now,
  })
}

function lastStartOf(runs: readonly RunRecord[]): string | null {
  return runs.reduce<string | null>((latest, run) => {
    const at = run.startedAt ?? run.dueAt
    return !latest || at > latest ? at : latest
  }, null)
}

export function toCampaignListItem(campaign: CampaignRecord, ctx: ListItemContext): CampaignListItem {
  const hasOpenRun = ctx.runs.some(isOpen)
  const hasAnyRun = ctx.runs.length > 0
  const due = dueOf(campaign, ctx.runs, ctx.quietHours, ctx.now)
  const displayState = deriveDisplayState({ ...campaign, hasAnyRun, hasOpenRun, isPhoneReady: ctx.isPhoneReady, due })
  const nextSendAt = ['scheduled', 'repeating', 'waiting_for_phone', 'app_managed'].includes(displayState) && due.dueAt ? due.dueAt.toISOString() : null
  const audiencePreset = matchAudiencePreset(campaign.audience)
  return {
    id: campaign.id,
    name: campaign.name,
    messageTemplate: campaign.messageTemplate,
    messagePreview: messagePreviewOf(campaign.messageTemplate),
    audience: campaign.audience,
    audiencePreset,
    audienceLabel: audienceLabelOf(audiencePreset),
    schedule: campaign.schedule,
    status: campaign.status,
    delivery: campaign.delivery,
    displayState,
    pauseReason: campaign.status === 'paused' ? campaign.pauseReason ?? 'owner' : null,
    whenLabel: whenLabelOf({ state: displayState, schedule: campaign.schedule, nextSendAt, lastSentAt: lastStartOf(ctx.runs), now: ctx.now }),
    nextSendAt,
    progress: hasOpenRun ? ctx.progress : null,
    results: ctx.results,
    isEditable: isCampaignEditable({ ...campaign, hasAnyRun, hasOpenRun }),
    updatedAt: campaign.updatedAt,
    createdAt: campaign.createdAt,
  }
}
