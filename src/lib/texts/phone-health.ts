/**
 * Is a sending phone on? Pure; always at the SERVER's clock.
 *
 * Built from the real cadence of the phone's worker
 * (webnegosyo-app/lib/sms-automations/outbox-worker.ts): a 60s idle poll, a
 * 10-minute poll during quiet hours, waits clamped to 30 minutes at the daily
 * limit or when paced. The heartbeat is written at the top of every claim,
 * before the quiet-hours check, so a resting phone still checks in. Each
 * threshold is at least three times the cadence it covers, so a single missed
 * poll never flips a phone from ready to late.
 */

import type { PhoneState, SenderHeroState, SendingPhone } from './types'

/** Three idle polls. */
export const READY_MAX_SEC = 180
/** 1.5 quiet-hours polls. */
export const QUIET_RESTING_MAX_SEC = 900
/** A daily-limit wait (30 min) plus slack. */
export const LIMIT_RESTING_MAX_SEC = 2100
/** Past this the phone is offline. */
export const LATE_MAX_SEC = 1800
/** "Inactive" on the card. */
export const INACTIVE_AFTER_SEC = 48 * 3600

export interface PhoneHealthInput {
  lastSeenAt: string | null
  now: Date
  isQuietNow: boolean
  isLimitReached: boolean
}

export interface PhoneHealth {
  state: PhoneState
  /** Whole seconds since the last check-in; null when it never checked in. */
  ageSeconds: number | null
  isInactive: boolean
}

function restingAllowance(isQuietNow: boolean, isLimitReached: boolean): number {
  if (isLimitReached) return LIMIT_RESTING_MAX_SEC
  if (isQuietNow) return QUIET_RESTING_MAX_SEC
  return -1
}

export function phoneHealth({ lastSeenAt, now, isQuietNow, isLimitReached }: PhoneHealthInput): PhoneHealth {
  const seenAt = lastSeenAt === null ? Number.NaN : Date.parse(lastSeenAt)
  if (!Number.isFinite(seenAt)) return { state: 'never', ageSeconds: null, isInactive: false }
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - seenAt) / 1000))
  const isInactive = ageSeconds > INACTIVE_AFTER_SEC
  if (ageSeconds <= restingAllowance(isQuietNow, isLimitReached)) return { state: 'resting', ageSeconds, isInactive }
  if (ageSeconds <= READY_MAX_SEC) return { state: 'ready', ageSeconds, isInactive }
  if (ageSeconds <= LATE_MAX_SEC) return { state: 'late', ageSeconds, isInactive }
  return { state: 'offline', ageSeconds, isInactive }
}

const STATE_RANK: Record<PhoneState, number> = { ready: 0, resting: 1, late: 2, offline: 3, never: 4 }

/** The phone the hero talks about: best state, then the freshest check-in. */
export function pickPrimaryPhone(phones: readonly SendingPhone[]): SendingPhone | null {
  if (phones.length === 0) return null
  const sorted = [...phones].sort((a, b) =>
    STATE_RANK[a.state] - STATE_RANK[b.state]
    || (a.ageSeconds ?? Number.MAX_SAFE_INTEGER) - (b.ageSeconds ?? Number.MAX_SAFE_INTEGER))
  return sorted[0]
}

export interface HeroInput {
  primary: SendingPhone | null
  hasReadError: boolean
  /** A server campaign run is open (sending or waiting). */
  hasOpenRun: boolean
}

const HERO_FOR_PHONE: Record<PhoneState, SenderHeroState> = {
  ready: 'ready',
  resting: 'resting',
  late: 'late',
  offline: 'offline',
  // Enrolled but never heard from: as far as the store can tell, it is off.
  never: 'offline',
}

/** Never "ready" on an error: the page says "Can't check" instead. */
export function heroStateFor({ primary, hasReadError, hasOpenRun }: HeroInput): SenderHeroState {
  if (hasReadError) return 'unknown'
  if (primary === null) return 'none'
  if (primary.state === 'ready' && hasOpenRun) return 'sending'
  return HERO_FOR_PHONE[primary.state]
}

/**
 * The first app version whose phone sends automated texts and campaigns
 * (the outbox worker shipped as an OTA to 1.0.13 binaries on 2026-10-13).
 * A phone reporting an older version still checks in through the reward-code
 * worker but never picks up a text, so the card says "Update the app".
 */
export const MIN_SENDER_APP_VERSION = '1.0.13'

function versionParts(version: string): number[] | null {
  const match = /^(\d+(?:\.\d+){0,3})(?:[-+].*)?$/.exec(version.trim())
  return match ? match[1].split('.').map(Number) : null
}

/** Unknown (no report, unreadable) is never "old": an older app sends no report at all. */
export function isAppOld(appVersion: string | null, minimum: string = MIN_SENDER_APP_VERSION): boolean {
  const have = appVersion === null ? null : versionParts(appVersion)
  const need = versionParts(minimum)
  if (!have || !need) return false
  for (let i = 0; i < Math.max(have.length, need.length); i += 1) {
    const diff = (have[i] ?? 0) - (need[i] ?? 0)
    if (diff !== 0) return diff < 0
  }
  return false
}

export interface PhoneNameParts {
  label: string | null
  manufacturer: string | null
  model: string | null
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** Owner's label, else "Samsung SM-A155F", else "Android phone". */
export function phoneDisplayName({ label, manufacturer, model }: PhoneNameParts): string {
  const owned = label?.trim()
  if (owned) return owned
  const make = manufacturer?.trim() ? capitalise(manufacturer.trim()) : null
  const name = model?.trim() || null
  if (make && name) return name.toLowerCase().startsWith(make.toLowerCase()) ? name : `${make} ${name}`
  if (name) return name
  return make ? `${make} phone` : 'Android phone'
}

/**
 * Two un-renamed phones of the same make both read "Android phone"; number
 * them ("Android phone 1", "Android phone 2") in list order so the hero, the
 * sheet and the disconnect dialog can tell them apart. Owner labels are kept.
 */
export function withDistinctNames<T extends { name: string; hasCustomName: boolean }>(phones: readonly T[]): T[] {
  const totals = new Map<string, number>()
  for (const phone of phones) totals.set(phone.name, (totals.get(phone.name) ?? 0) + 1)
  const seen = new Map<string, number>()
  return phones.map((phone) => {
    if (phone.hasCustomName || (totals.get(phone.name) ?? 0) < 2) return phone
    const index = (seen.get(phone.name) ?? 0) + 1
    seen.set(phone.name, index)
    return { ...phone, name: `${phone.name} ${index}` }
  })
}
