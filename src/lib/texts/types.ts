/**
 * Web "Texts" (/admin/texts): the shapes the server hands the page.
 *
 * This file is the contract between the server modules (`src/lib/texts/server/*`,
 * `src/app/actions/texts.ts`, `GET /api/admin/texts/live`) and the components in
 * `src/components/admin/texts/`. Plain data only — no Supabase, no React — so a
 * 'use client' file can import it and a 'use server' file never has to export a
 * type (that breaks `next build`).
 */

import type { RecipeId } from '@/lib/sms-automations/types'

// ─── Campaigns ───────────────────────────────────────────────────────────────

/** The `sms_campaigns.audience` jsonb. Every field optional; all AND together. */
export interface AudienceFilter {
  lastOrderOlderThanDays?: number
  lastOrderWithinDays?: number
  minOrderCount?: number
  maxOrderCount?: number
  minTotalSpent?: number
  channels?: string[]
}

/** The named chips the composer offers; `custom` = the owner edited the filter by hand. */
export const AUDIENCE_PRESETS = ['everyone', 'lapsed', 'regulars', 'first_timers', 'recent', 'custom'] as const
export type AudiencePreset = (typeof AUDIENCE_PRESETS)[number]

export const SCHEDULE_KINDS = ['one_off', 'every_n_days', 'weekly'] as const
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

/** How the composer's "When" maps onto the row. `now` = a one-off sent on confirm. */
export type WhenChoice = 'now' | 'later' | 'repeat'

export interface CampaignSchedule {
  kind: ScheduleKind
  /** Manila wall clock "HH:MM". */
  time: string
  /** one_off: "YYYY-MM-DD" (Manila). */
  date: string | null
  /** every_n_days only. */
  intervalDays: number | null
  /** weekly only: ISO weekdays 1=Mon..7=Sun. */
  weekdays: number[]
  /** Repeats only: last day it may send, "YYYY-MM-DD" (Manila). Required on the web. */
  endsOn: string | null
}

/** What the composer saves. */
export interface CampaignDraftInput {
  id?: string
  name: string
  messageTemplate: string
  audience: AudienceFilter
  schedule: CampaignSchedule
}

/** Raw row values that matter to the page (`delivery`/`scheduled` are new). */
export type CampaignRowStatus = 'draft' | 'active' | 'paused' | 'archived' | 'scheduled'
export type CampaignDelivery = 'phone' | 'server'

/** What the list shows as a chip — derived, never stored. */
export const CAMPAIGN_DISPLAY_STATES = [
  'draft',
  'scheduled',
  'repeating',
  'waiting_for_phone',
  'sending',
  'paused',
  'sent',
  'finished',
  'archived',
  /** delivery='phone' + active: the owner's Android app sends it by hand. */
  'app_managed',
] as const
export type CampaignDisplayState = (typeof CAMPAIGN_DISPLAY_STATES)[number]

/** Why a server campaign paused itself (shown as a Needs-attention row). */
export type CampaignPauseReason = 'owner' | 'missed_no_phone' | null

export interface CampaignRunProgress {
  runId: string
  sent: number
  notSent: number
  waiting: number
  total: number
  /** ISO; null when nothing is waiting or it can't be estimated. */
  finishAt: string | null
  isQuietNow: boolean
  isWaitingForPhone: boolean
}

export interface CampaignResults {
  sent: number
  notSent: number
  cameBack: number
  /** Sum of the first order per returning guest, in pesos. */
  sales: number
  /** False while the 14-day window is still open for some sends. */
  isFinal: boolean
  /** ISO day the window closes (results "final on …"). */
  finalOn: string | null
  /** True when the store is not on the platform backend: "at least" numbers. */
  isApproximate: boolean
}

export interface CampaignListItem {
  id: string
  name: string
  messageTemplate: string
  /** First line of the message, for the list's muted second line. */
  messagePreview: string
  audience: AudienceFilter
  audiencePreset: AudiencePreset
  /** "Regulars", "Everyone", "Custom"… */
  audienceLabel: string
  schedule: CampaignSchedule
  status: CampaignRowStatus
  delivery: CampaignDelivery
  displayState: CampaignDisplayState
  pauseReason: CampaignPauseReason
  /** "Sent Oct 12, 10:00 AM" / "Starts Fri, 10:00 AM" / "Every Friday, 10:00 AM" / "—". */
  whenLabel: string
  /** ISO of the next send for scheduled/repeating; null otherwise. */
  nextSendAt: string | null
  /** Open run, when one is sending or waiting for a phone. */
  progress: CampaignRunProgress | null
  /** Totals over every run (null before anything was sent). */
  results: CampaignResults | null
  /** Message/audience/schedule can still change (nothing sent yet, no open run). */
  isEditable: boolean
  updatedAt: string
  createdAt: string
}

export type SkippedReason =
  | 'no_phone'
  | 'no_consent'
  | 'opted_out'
  | 'suppressed'
  | 'recently_texted'
  | 'cannot_fill'
  | 'over_ceiling'

export interface AudiencePreview {
  /** Guests who will get it right now. */
  reach: number
  /** Only reasons with a count > 0 (excludes plain "didn't match the filter"). */
  skipped: Partial<Record<SkippedReason, number>>
  /** Up to 5 rendered previews (masked names) for "Preview as". */
  samples: Array<{ label: string; body: string }>
  /** Texts per guest for the template incl. the opt-out line. */
  segmentsPerGuest: number
  /** reach × segmentsPerGuest. */
  textsUsed: number
  /** ISO estimate when the last text goes out (includes the queue ahead + daily limit). */
  finishAt: string | null
  /** Already waiting ahead of this campaign. */
  waitingAhead: number
  /** Whole days at the daily limit, when > 1 (drives "takes about 3 days"). */
  daysToFinish: number
  dailyLimit: number
}

export interface CampaignRunReport {
  runId: string
  startedAt: string | null
  sent: number
  notSent: number
  waiting: number
  cameBack: number
  sales: number
  /** Humanised not-sent buckets. */
  notSentByReason: Array<{ reason: string; count: number }>
}

export interface CampaignReportGuest {
  /** "Maria S. · ending 4567" — never the full number. */
  label: string
  status: 'waiting' | 'sent' | 'not_sent'
  /** Reason text when not sent. */
  reason: string | null
  sentAt: string | null
  /** First order within 14 days, if any. */
  orderedAt: string | null
  orderTotal: number | null
}

export interface CampaignReport {
  campaign: CampaignListItem
  totals: CampaignResults | null
  runs: CampaignRunReport[]
  guests: CampaignReportGuest[]
  /** Cursor for the next 50 guests; null at the end. */
  nextCursor: string | null
}

// ─── Phones ──────────────────────────────────────────────────────────────────

export const PHONE_STATES = ['never', 'ready', 'resting', 'late', 'offline'] as const
export type PhoneState = (typeof PHONE_STATES)[number]

export interface SendingPhone {
  deviceId: string
  /** Owner's label, else "Manufacturer Model", else "Android phone". */
  name: string
  /** True when `name` is the owner's label. */
  hasCustomName: boolean
  model: string | null
  appVersion: string | null
  /** The app is older than the version the web expects. */
  isAppOld: boolean
  state: PhoneState
  lastSeenAt: string | null
  /** Seconds since last check-in at the server's clock. */
  ageSeconds: number | null
  /** Over 48h quiet. */
  isInactive: boolean
  connectedAt: string | null
  /** Staff label of who connected it. */
  connectedBy: string | null
  sentToday: number
  failedToday: number
  /** Claimed right now (in the phone's hands). */
  sendingNow: number
  /** null = not reported (older app). */
  smsPermission: boolean | null
  /** true = battery saver is NOT restricting the app; null = not reported. */
  isBatteryUnrestricted: boolean | null
}

/** The page's phone hero, computed server-side from every phone + the queue. */
export type SenderHeroState =
  | 'none'
  | 'ready'
  | 'sending'
  | 'late'
  | 'offline'
  | 'resting'
  | 'unknown'

export interface SenderSummary {
  heroState: SenderHeroState
  /** The phone the hero talks about (best state); null when none. */
  primary: SendingPhone | null
  phones: SendingPhone[]
  maxPhones: number
  waiting: number
  sentToday: number
  dailyLimit: number
  isQuietNow: boolean
  /** ISO when quiet hours end, when quiet now. */
  quietUntil: string | null
  /** ISO estimate when everything waiting is out. */
  allOutBy: string | null
  /** The campaign currently sending, if any. */
  sending: { id: string; name: string; sent: number; total: number; finishAt: string | null } | null
  /** Server clock, so "2 min ago" never uses the browser's clock. */
  now: string
}

// ─── Needs attention ─────────────────────────────────────────────────────────

export interface AttentionItem {
  id: string
  severity: 'urgent' | 'warn'
  kind:
    | 'waiting_no_phone'
    | 'campaign_paused_itself'
    | 'failure_spike'
    | 'starts_soon_offline'
    | 'campaign_no_one'
    | 'review_link_missing'
    | 'phone_needs_fix'
  text: string
  action: { label: string; href: string }
}

// ─── Live endpoint + page ────────────────────────────────────────────────────

/** GET /api/admin/texts/live?tenantId=… — polled every 30s (10s while sending). */
export interface TextsLive {
  sender: SenderSummary
  attention: AttentionItem[]
  /** Open runs by campaign id, for the list's progress cells. */
  progress: Record<string, CampaignRunProgress>
}

export interface ThirtyDayLine {
  sent: number
  cameBack: number
  sales: number
}

export type TextsTab = 'campaigns' | 'automatic' | 'activity' | 'rules'

/** Re-exported for components that label automatic texts. */
export type { RecipeId }

/** Result shape every Texts server action returns. */
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string }

// ─── Page payload ────────────────────────────────────────────────────────────

/**
 * Everything `/admin/texts` renders on first paint (`loadTextsPage`). Automatic
 * texts reuse the app's view model verbatim (`listAutomationsView`), so the web
 * and the app can never describe the same automation differently.
 */
export interface TextsPageData {
  tenantId: string
  tenantSlug: string
  storeName: string
  isOwner: boolean
  isDemo: boolean
  live: TextsLive
  thirtyDays: ThirtyDayLine
  campaigns: CampaignListItem[]
  automations: Awaited<ReturnType<typeof import('@/lib/sms-automations/api/reads').listAutomationsView>>
  /** The store's message variables + opt-out line, for the composer. */
  optOutLine: string | null
}
